from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.engine import get_db
from api.db.models import AuditEvent, ClientProfile, HealthLog, User
from api.middleware.auth import get_current_user, require_consultant
from api.services.encryption import decrypt_payload, encrypt_payload, should_encrypt
from api.services.realtime import publish_update

router = APIRouter(prefix="/logs", tags=["logs"])


class LogCreateRequest(BaseModel):
    log_type: str
    payload: dict
    logged_at: datetime | None = None


@router.post("", status_code=201)
async def create_log(
    body: LogCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    logged_at = body.logged_at or datetime.now(timezone.utc)
    encrypted = should_encrypt(body.log_type)

    if encrypted:
        blob = encrypt_payload(body.payload)
        log_entry = HealthLog(
            user_id=current_user.id,
            log_type=body.log_type,
            logged_at=logged_at,
            payload={"encrypted": True},
            encrypted_payload=blob,
            is_encrypted=True,
        )
    else:
        log_entry = HealthLog(
            user_id=current_user.id,
            log_type=body.log_type,
            logged_at=logged_at,
            payload=body.payload,
            is_encrypted=False,
        )

    db.add(log_entry)

    if body.log_type == "meal":
        await _update_streak(current_user.id, logged_at.date().isoformat(), db)

    await db.commit()
    await db.refresh(log_entry)

    await publish_update(current_user.id, {
        "event": "new_log",
        "log_type": log_entry.log_type,
        "logged_at": log_entry.logged_at.isoformat(),
        "payload": body.payload,
    })

    return {"id": log_entry.id, "logged_at": log_entry.logged_at}


@router.get("")
async def get_my_logs(
    days: int = Query(default=7, le=365),
    log_type: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    query = (
        select(HealthLog)
        .where(HealthLog.user_id == current_user.id)
        .where(HealthLog.logged_at >= since)
        .order_by(HealthLog.logged_at.desc())
    )
    if log_type:
        query = query.where(HealthLog.log_type == log_type)

    result = await db.execute(query)
    return [_serialize_log(l) for l in result.scalars().all()]


@router.get("/client/{client_id}")
async def get_client_logs(
    client_id: str,
    days: int = Query(default=30, le=365),
    log_type: str | None = Query(default=None),
    consultant: User = Depends(require_consultant),
    db: AsyncSession = Depends(get_db),
):
    cp = (await db.execute(
        select(ClientProfile).where(
            ClientProfile.user_id == client_id,
            ClientProfile.assigned_consultant_id == consultant.id,
        )
    )).scalar_one_or_none()
    if not cp:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not your client")

    since = datetime.now(timezone.utc) - timedelta(days=days)
    query = (
        select(HealthLog)
        .where(HealthLog.user_id == client_id)
        .where(HealthLog.logged_at >= since)
        .order_by(HealthLog.logged_at.asc())
    )
    if log_type:
        query = query.where(HealthLog.log_type == log_type)

    result = await db.execute(query)
    logs = result.scalars().all()

    db.add(AuditEvent(
        actor_id=consultant.id,
        target_user_id=client_id,
        action="read_health_logs",
        resource=f"logs?days={days}",
    ))
    await db.commit()

    return [_serialize_log(l) for l in logs]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize_log(log: HealthLog) -> dict:
    if log.is_encrypted and log.encrypted_payload:
        try:
            payload = decrypt_payload(log.encrypted_payload)
        except Exception:
            payload = {"error": "decryption failed — check ENCRYPTION_KEY"}
    else:
        payload = log.payload
    return {
        "id":        log.id,
        "log_type":  log.log_type,
        "logged_at": log.logged_at,
        "payload":   payload,
    }


async def _update_streak(user_id: str, today_str: str, db) -> None:
    result = await db.execute(
        select(ClientProfile).where(ClientProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        return

    if profile.last_logged_date == today_str:
        return

    yesterday = (
        datetime.strptime(today_str, "%Y-%m-%d") - timedelta(days=1)
    ).strftime("%Y-%m-%d")

    if profile.last_logged_date == yesterday:
        profile.current_streak = (profile.current_streak or 0) + 1
    else:
        profile.current_streak = 1

    if (profile.current_streak or 0) > (profile.longest_streak or 0):
        profile.longest_streak = profile.current_streak

    profile.last_logged_date = today_str
    db.add(profile)
