"""
Redis Pub/Sub bridge for real-time sync.

Mobile app posts a health log → publish_update() fires →
WebSocket hub picks it up → pushes to consultant portal
and any other connected sessions for that user.
"""
from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis

from api.config import settings

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def publish_update(user_id: str, data: dict[str, Any]) -> None:
    channel = f"user:{user_id}:updates"
    await get_redis().publish(channel, json.dumps(data))
