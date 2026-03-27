"""
WebSocket hub — one connection per authenticated session.

Clients connect at:  ws://host/ws?token=<access_token>
Consultant portal:   ws://host/ws?token=<access_token>&watch=<client_id>

The hub subscribes to Redis channels:
  - user:{current_user.id}:updates   (own events — multi-device sync)
  - user:{watch_id}:updates          (consultant watching a client)

Security:
  - JWT is verified then the user is re-fetched from DB (is_active check).
  - Consultant `watch` param is validated against ClientProfile ownership.
  - Heartbeat ping sent every 60 s; connection closed if pong missing within 10 s.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import structlog
from fastapi import WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select

from api.config import settings
from api.db.engine import AsyncSessionLocal
from api.db.models import ClientProfile, User
from api.services.realtime import get_redis

log = structlog.get_logger()

_PING_INTERVAL = 60   # seconds between pings
_PONG_TIMEOUT  = 10   # seconds to wait for pong before closing


async def _decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


async def websocket_handler(ws: WebSocket, token: str, watch: str | None = None):
    # ── 1. Verify JWT ──────────────────────────────────────────────────────────
    try:
        payload = await _decode_token(token)
        user_id: str = payload["sub"]
        role: str = payload.get("role", "")
        if payload.get("type") == "refresh":
            raise ValueError("refresh token not valid for WS")
    except (JWTError, KeyError, ValueError):
        await ws.close(code=4001, reason="Unauthorized")
        return

    # ── 2. Verify user exists and is active in DB ──────────────────────────────
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not user or not user.is_active:
            await ws.close(code=4001, reason="Account inactive or not found")
            return

        # ── 3. Validate consultant watch param ─────────────────────────────────
        channels = [f"user:{user_id}:updates"]
        if watch and role == "consultant":
            cp = (await db.execute(
                select(ClientProfile).where(
                    ClientProfile.user_id == watch,
                    ClientProfile.assigned_consultant_id == user_id,
                )
            )).scalar_one_or_none()
            if cp:
                channels.append(f"user:{watch}:updates")
            else:
                log.warning("ws.watch_denied", user_id=user_id, watch=watch)
                # Don't close — just don't subscribe to the unauthorized channel

    await ws.accept()
    log.info("ws.connected", user_id=user_id, channels=channels)

    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(*channels)

    pong_event = asyncio.Event()

    async def _reader():
        """Read incoming frames — watch for pong responses."""
        try:
            while True:
                data = await ws.receive_text()
                try:
                    frame = json.loads(data)
                    if frame.get("event") == "pong":
                        pong_event.set()
                except Exception:
                    pass
        except WebSocketDisconnect:
            pass

    async def _redis_listener():
        """Forward Redis pub/sub messages to the WebSocket."""
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                data = json.loads(message["data"])
                data["_channel"] = message["channel"]
                await ws.send_json(data)
            except Exception as exc:
                log.warning("ws.send_error", exc=str(exc))
                break

    async def _heartbeat():
        """Send ping every 60 s; close if pong doesn't arrive within 10 s."""
        while True:
            await asyncio.sleep(_PING_INTERVAL)
            pong_event.clear()
            try:
                await ws.send_json({"event": "ping"})
            except Exception:
                break
            try:
                await asyncio.wait_for(pong_event.wait(), timeout=_PONG_TIMEOUT)
            except asyncio.TimeoutError:
                log.info("ws.heartbeat_timeout", user_id=user_id)
                await ws.close(code=1001, reason="Heartbeat timeout")
                break

    try:
        await asyncio.gather(_reader(), _redis_listener(), _heartbeat())
    except WebSocketDisconnect:
        log.info("ws.disconnected", user_id=user_id)
    except Exception as exc:
        log.warning("ws.error", exc=str(exc), user_id=user_id)
    finally:
        await pubsub.unsubscribe(*channels)
        await pubsub.close()
        log.info("ws.cleanup", user_id=user_id)
