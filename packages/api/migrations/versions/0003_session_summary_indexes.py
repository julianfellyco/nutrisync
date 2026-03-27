"""Add summary to ai_sessions and composite indexes for query performance

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── AISession: summary column ─────────────────────────────────────────────
    op.add_column("ai_sessions", sa.Column("summary", sa.Text(), nullable=True))

    # ── Composite indexes ─────────────────────────────────────────────────────
    # Serves: GET /logs?log_type=meal&days=N (filtered + time-range)
    op.create_index(
        "ix_health_logs_user_type_logged",
        "health_logs",
        ["user_id", "log_type", "logged_at"],
    )

    # Serves: list_clients — join ClientProfile → filter by consultant
    op.create_index(
        "ix_client_profiles_consultant",
        "client_profiles",
        ["assigned_consultant_id"],
    )

    # Serves: list_plans?client_id= and ownership checks
    op.create_index(
        "ix_plans_client_consultant",
        "plans",
        ["client_id", "consultant_id"],
    )

    # Serves: audit log queries by actor ordered by time
    op.create_index(
        "ix_audit_events_actor",
        "audit_events",
        ["actor_id", "occurred_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_audit_events_actor", table_name="audit_events")
    op.drop_index("ix_plans_client_consultant", table_name="plans")
    op.drop_index("ix_client_profiles_consultant", table_name="client_profiles")
    op.drop_index("ix_health_logs_user_type_logged", table_name="health_logs")
    op.drop_column("ai_sessions", "summary")
