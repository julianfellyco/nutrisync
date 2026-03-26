"""
Proactive health insights — consultant-only endpoint.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.engine import get_db
from api.db.models import ClientProfile, User
from api.middleware.auth import require_consultant
from api.services.insights import get_insights

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/{client_id}")
async def client_insights(
    client_id: str,
    consultant: User = Depends(require_consultant),
    db: AsyncSession = Depends(get_db),
):
    """Return a prioritised list of health insight cards for a client."""
    # Verify ownership
    result = await db.execute(
        select(ClientProfile).where(
            ClientProfile.user_id == client_id,
            ClientProfile.assigned_consultant_id == consultant.id,
        )
    )
    if not result.scalar_one_or_none():
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not your client")

    insights = await get_insights(client_id, db)
    return {"client_id": client_id, "insights": [i.model_dump() for i in insights]}
