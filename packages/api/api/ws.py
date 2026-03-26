"""
WebSocket hub — one connection per authenticated session.

Clients connect at:  ws://host/ws?token=<access_token>
Consultant portal:   ws://host/ws?token=<access_token>&watch=<client_id>

The hub subscribes to Redis channels:
  - user:{current_user.id}:updates   (own events — multi-device sync)
  - user:{watch_id}:updates          (consultant watching a client)
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import redis.asyncio as aioredis
import structlog
from fastapi import WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from api.config import settings
from api.services.realtime import get_redis

log = structlog.get_logger()


async def _decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


async def websocket_handler(ws: WebSocket, token: str, watch: str | None = None):
    try:
        payload = await _decode_token(token)
        user_id: str = payload["sub"]
        role: str = payload["role"]
    except (JWTError, KeyError):
        await ws.close(code=4001, reason="Unauthorized")
        return

    # Consultants may subscribe to a client channel; clients cannot subscribe to others.
    channels = [f"user:{user_id}:updates"]
    if watch and role == "consultant":
        channels.append(f"user:{watch}:updates")

    await ws.accept()
    log.info("ws.connected", user_id=user_id, channels=channels)

    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(*channels)

    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                data = json.loads(message["data"])
                # Tag which channel triggered this so the client can route it
                data["_channel"] = message["channel"]
                await ws.send_json(data)
            except Exception as exc:
                log.warning("ws.send_error", exc=str(exc))
    except WebSocketDisconnect:
        log.info("ws.disconnected", user_id=user_id)
    finally:
        await pubsub.unsubscribe(*channels)
        await pubsub.close()
