from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.engine import get_db
from api.db.models import AuditEvent, ClientProfile, User
from api.middleware.auth import require_consultant

router = APIRouter(prefix="/clients", tags=["clients"])


class ClientProfileUpdate(BaseModel):
    fitness_goal: str | None = None
    dietary_restrictions: list[str] | None = None
    macro_targets: dict | None = None
    dob: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None


class ClaimRequest(BaseModel):
    email: EmailStr


@router.get("")
async def list_clients(
    consultant: User = Depends(require_consultant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User, ClientProfile)
        .join(ClientProfile, ClientProfile.user_id == User.id)
        .where(ClientProfile.assigned_consultant_id == consultant.id)
    )
    return [_serialize(u, p) for u, p in result.all()]


@router.get("/unassigned")
async def list_unassigned(
    consultant: User = Depends(require_consultant),
    db: AsyncSession = Depends(get_db),
):
    """All clients with no assigned consultant — available to claim."""
    result = await db.execute(
        select(User, ClientProfile)
        .join(ClientProfile, ClientProfile.user_id == User.id)
        .where(ClientProfile.assigned_consultant_id.is_(None))
    )
    return [_serialize(u, p) for u, p in result.all()]


@router.post("/claim")
async def claim_client(
    body: ClaimRequest,
    consultant: User = Depends(require_consultant),
    db: AsyncSession = Depends(get_db),
):
    """Assign an unassigned client (by email) to this consultant."""
    result = await db.execute(
        select(User, ClientProfile)
        .join(ClientProfile, ClientProfile.user_id == User.id)
        .where(User.email == body.email)
        .where(User.role == "client")
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="No client account found with that email")
    user, profile = row
    if profile.assigned_consultant_id and profile.assigned_consultant_id != consultant.id:
        raise HTTPException(status_code=409, detail="This client is already assigned to another consultant")

    profile.assigned_consultant_id = consultant.id
    db.add(AuditEvent(actor_id=consultant.id, target_user_id=user.id, action="claim_client"))
    await db.commit()
    return _serialize(user, profile)


@router.get("/{client_id}")
async def get_client(
    client_id: str,
    consultant: User = Depends(require_consultant),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_owned(client_id, consultant.id, db)
    return _serialize(row[0], row[1])


@router.patch("/{client_id}")
async def update_client(
    client_id: str,
    body: ClientProfileUpdate,
    consultant: User = Depends(require_consultant),
    db: AsyncSession = Depends(get_db),
):
    user, profile = await _get_owned(client_id, consultant.id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(profile, field, value)
    db.add(AuditEvent(actor_id=consultant.id, target_user_id=user.id, action="update_profile"))
    await db.commit()
    return _serialize(user, profile)


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_owned(client_id: str, consultant_id: str, db: AsyncSession):
    result = await db.execute(
        select(User, ClientProfile)
        .join(ClientProfile, ClientProfile.user_id == User.id)
        .where(User.id == client_id)
        .where(ClientProfile.assigned_consultant_id == consultant_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    return row


def _serialize(user: User, profile: ClientProfile) -> dict:
    return {
        "id":    user.id,
        "name":  user.name,
        "email": user.email,
        "profile": {
            "dob":                    profile.dob,
            "height_cm":              profile.height_cm,
            "weight_kg":              profile.weight_kg,
            "fitness_goal":           profile.fitness_goal,
            "dietary_restrictions":   profile.dietary_restrictions,
            "macro_targets":          profile.macro_targets,
            "assigned_consultant_id": profile.assigned_consultant_id,
            "current_streak": profile.current_streak,
            "longest_streak": profile.longest_streak,
        },
    }
