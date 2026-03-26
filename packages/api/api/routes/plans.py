from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.engine import get_db
from api.db.models import ClientProfile, Plan
from api.middleware.auth import require_consultant, User

router = APIRouter(prefix="/plans", tags=["plans"])


class PlanBody(BaseModel):
    client_id: str
    plan_type: str        # "meal" | "workout"
    valid_from: str
    valid_to: str
    content: dict


class PlanPatch(BaseModel):
    valid_from: str | None = None
    valid_to: str | None = None
    content: dict | None = None


async def _assert_owns_client(consultant_id: str, client_id: str, db: AsyncSession):
    result = await db.execute(
        select(ClientProfile).where(
            ClientProfile.user_id == client_id,
            ClientProfile.assigned_consultant_id == consultant_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not your client")


@router.get("")
async def list_plans(
    client_id: str,
    consultant: User = Depends(require_consultant),
    db: AsyncSession = Depends(get_db),
):
    await _assert_owns_client(consultant.id, client_id, db)
    result = await db.execute(
        select(Plan).where(Plan.client_id == client_id).order_by(Plan.created_at.desc())
    )
    return [_serialize(p) for p in result.scalars().all()]


@router.post("", status_code=201)
async def create_plan(
    body: PlanBody,
    consultant: User = Depends(require_consultant),
    db: AsyncSession = Depends(get_db),
):
    await _assert_owns_client(consultant.id, body.client_id, db)
    plan = Plan(
        client_id=body.client_id,
        consultant_id=consultant.id,
        plan_type=body.plan_type,
        valid_from=body.valid_from,
        valid_to=body.valid_to,
        content=body.content,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return _serialize(plan)


@router.patch("/{plan_id}")
async def update_plan(
    plan_id: str,
    body: PlanPatch,
    consultant: User = Depends(require_consultant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Plan).where(Plan.id == plan_id, Plan.consultant_id == consultant.id)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if body.content   is not None: plan.content   = body.content
    if body.valid_from is not None: plan.valid_from = body.valid_from
    if body.valid_to   is not None: plan.valid_to   = body.valid_to
    plan.version += 1

    await db.commit()
    await db.refresh(plan)
    return _serialize(plan)


def _serialize(p: Plan) -> dict:
    return {
        "id": p.id,
        "client_id": p.client_id,
        "plan_type": p.plan_type,
        "valid_from": p.valid_from,
        "valid_to": p.valid_to,
        "content": p.content,
        "version": p.version,
    }
