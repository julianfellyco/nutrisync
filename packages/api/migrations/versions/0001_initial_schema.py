"""initial schema + timescaledb hypertable

Revision ID: 0001
Revises:
Create Date: 2026-03-26
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id",              sa.String(),  primary_key=True),
        sa.Column("email",           sa.String(),  nullable=False),
        sa.Column("hashed_password", sa.String(),  nullable=False),
        sa.Column("role", sa.Enum("client", "consultant", name="user_role"), nullable=False),
        sa.Column("name",      sa.String(),  nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ── client_profiles ────────────────────────────────────────────────────────
    op.create_table(
        "client_profiles",
        sa.Column("user_id",    sa.String(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("dob",        sa.String(), nullable=True),
        sa.Column("height_cm",  sa.Float(),  nullable=True),
        sa.Column("weight_kg",  sa.Float(),  nullable=True),
        sa.Column("fitness_goal", sa.String(), nullable=True),
        sa.Column("dietary_restrictions", postgresql.JSONB(), server_default="[]"),
        sa.Column("macro_targets",        postgresql.JSONB(), server_default="{}"),
        sa.Column("assigned_consultant_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
    )

    # ── health_logs ────────────────────────────────────────────────────────────
    # Created as a plain table first; converted to TimescaleDB hypertable below.
    op.create_table(
        "health_logs",
        sa.Column("id",      sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("logged_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("log_type",
                  sa.Enum("meal", "activity", "biometric", name="log_type"),
                  nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
    )
    op.create_index("ix_health_logs_user_id",   "health_logs", ["user_id"])
    op.create_index("ix_health_logs_logged_at", "health_logs", ["logged_at"])

    # Convert to TimescaleDB hypertable when the extension is available.
    # Falls back silently on plain PostgreSQL (e.g. local dev without TimescaleDB).
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'
            ) THEN
                PERFORM create_extension('timescaledb', schema => 'public', if_not_exists => true);
                PERFORM create_hypertable(
                    'health_logs', 'logged_at',
                    chunk_time_interval => INTERVAL '1 week',
                    migrate_data => FALSE
                );
            END IF;
        END
        $$;
    """)

    # ── plans ──────────────────────────────────────────────────────────────────
    op.create_table(
        "plans",
        sa.Column("id",            sa.String(), primary_key=True),
        sa.Column("client_id",     sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("consultant_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("plan_type", sa.Enum("meal", "workout", name="plan_type"), nullable=False),
        sa.Column("valid_from", sa.String(), nullable=False),
        sa.Column("valid_to",   sa.String(), nullable=False),
        sa.Column("content",  postgresql.JSONB(), nullable=False),
        sa.Column("version",  sa.Integer(), server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_plans_client_id", "plans", ["client_id"])

    # ── ai_sessions ────────────────────────────────────────────────────────────
    op.create_table(
        "ai_sessions",
        sa.Column("id",      sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("messages", postgresql.JSONB(), server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_ai_sessions_user_id", "ai_sessions", ["user_id"])

    # ── audit_events ───────────────────────────────────────────────────────────
    op.create_table(
        "audit_events",
        sa.Column("id",             sa.String(), primary_key=True),
        sa.Column("actor_id",       sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action",   sa.String(), nullable=False),
        sa.Column("resource", sa.String(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), index=True),
        sa.Column("event_meta", postgresql.JSONB(), server_default="{}"),
    )


def downgrade() -> None:
    # Drop in reverse dependency order.
    # Note: downgrading health_logs removes the hypertable — all chunks are dropped.
    op.drop_table("audit_events")
    op.drop_table("ai_sessions")
    op.drop_table("plans")
    op.drop_table("health_logs")
    op.drop_table("client_profiles")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS log_type")
    op.execute("DROP TYPE IF EXISTS plan_type")
    op.execute("DROP TYPE IF EXISTS user_role")
