from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.engine import get_db
from api.db.models import AuditEvent, HealthLog, User
from api.middleware.auth import get_current_user, require_consultant
from api.services.realtime import publish_update

router = APIRouter(prefix="/logs", tags=["logs"])


class LogCreateRequest(BaseModel):
    log_type: str          # "meal" | "activity" | "biometric"
    payload: dict
    logged_at: datetime | None = None


@router.post("", status_code=201)
async def create_log(
    body: LogCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    log = HealthLog(
        user_id=current_user.id,
        log_type=body.log_type,
        payload=body.payload,
        logged_at=body.logged_at or datetime.now(timezone.utc),
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    # Notify all WebSocket subscribers (consultant portal + other devices)
    await publish_update(current_user.id, {
        "event": "new_log",
        "log_type": log.log_type,
        "logged_at": log.logged_at.isoformat(),
        "payload": log.payload,
    })

    return {"id": log.id, "logged_at": log.logged_at}


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
    logs = result.scalars().all()
    return [{"id": l.id, "log_type": l.log_type, "logged_at": l.logged_at, "payload": l.payload}
            for l in logs]


@router.get("/client/{client_id}")
async def get_client_logs(
    client_id: str,
    days: int = Query(default=30, le=365),
    consultant: User = Depends(require_consultant),
    db: AsyncSession = Depends(get_db),
):
    """Consultant-only: fetch a specific client's logs.
    Enforces assignment — consultant can only read their own clients.
    """
    from api.db.models import ClientProfile
    result = await db.execute(
        select(ClientProfile).where(
            ClientProfile.user_id == client_id,
            ClientProfile.assigned_consultant_id == consultant.id,
        )
    )
    if not result.scalar_one_or_none():
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not your client")

    since = datetime.now(timezone.utc) - timedelta(days=days)
    query = (
        select(HealthLog)
        .where(HealthLog.user_id == client_id)
        .where(HealthLog.logged_at >= since)
        .order_by(HealthLog.logged_at.asc())
    )
    result = await db.execute(query)
    logs = result.scalars().all()

    # Audit: consultant accessed client records
    db.add(AuditEvent(
        actor_id=consultant.id,
        target_user_id=client_id,
        action="read_health_logs",
        resource=f"logs?days={days}",
    ))
    await db.commit()

    return [{"id": l.id, "log_type": l.log_type, "logged_at": l.logged_at, "payload": l.payload}
            for l in logs]
