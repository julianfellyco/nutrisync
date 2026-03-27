from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Enum, ForeignKey, Integer,
    String, Text, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.db.engine import Base


def gen_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(
        Enum("client", "consultant", name="user_role"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    profile: Mapped["ClientProfile"] = relationship(
        back_populates="user", uselist=False,
        foreign_keys="ClientProfile.user_id",
    )
    health_logs: Mapped[list["HealthLog"]] = relationship(back_populates="user")
    ai_sessions: Mapped[list["AISession"]] = relationship(back_populates="user")


class ClientProfile(Base):
    __tablename__ = "client_profiles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    dob: Mapped[str | None] = mapped_column(String)          # ISO date string
    height_cm: Mapped[float | None] = mapped_column()
    weight_kg: Mapped[float | None] = mapped_column()
    fitness_goal: Mapped[str | None] = mapped_column(String) # e.g. "lose_weight", "gain_muscle"
    dietary_restrictions: Mapped[list] = mapped_column(JSONB, default=list)
    macro_targets: Mapped[dict] = mapped_column(JSONB, default=dict)
    # {"calories": 2000, "protein_g": 150, "carbs_g": 200, "fat_g": 60}
    assigned_consultant_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))

    # Gamification — streak tracking
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_logged_date: Mapped[str | None] = mapped_column(String)  # ISO date "YYYY-MM-DD"

    user: Mapped["User"] = relationship(
        back_populates="profile", foreign_keys="[ClientProfile.user_id]"
    )


class HealthLog(Base):
    """
    TimescaleDB hypertable — partition by logged_at.
    Run after migration:
        SELECT create_hypertable('health_logs', 'logged_at');
    """
    __tablename__ = "health_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    logged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    log_type: Mapped[str] = mapped_column(
        Enum("meal", "activity", "biometric", name="log_type"), nullable=False
    )
    # meal:      {name, calories, protein_g, carbs_g, fat_g, ingredients[]}
    # activity:  {type, duration_min, steps, avg_heart_rate, source}
    # biometric: {weight_kg, body_fat_pct, source}  ← encrypted at rest (see services/encryption.py)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # HIPAA: biometric payloads are Fernet-encrypted; raw ciphertext stored here
    encrypted_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_encrypted: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship(back_populates="health_logs")


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    client_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    consultant_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    plan_type: Mapped[str] = mapped_column(
        Enum("meal", "workout", name="plan_type"), nullable=False
    )
    valid_from: Mapped[str] = mapped_column(String, nullable=False)  # ISO date
    valid_to: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AISession(Base):
    __tablename__ = "ai_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    messages: Mapped[list] = mapped_column(JSONB, default=list)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="ai_sessions")


class AuditEvent(Base):
    """Append-only access log. Never update or delete rows."""
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    target_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "read_health_logs"
    resource: Mapped[str | None] = mapped_column(String)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    event_meta: Mapped[dict] = mapped_column(JSONB, default=dict)
