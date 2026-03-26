"""Add streaks to client_profiles and encryption fields to health_logs

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Streaks on ClientProfile ────────────────────────────────────────────────
    op.add_column("client_profiles",
        sa.Column("current_streak",  sa.Integer(), nullable=False, server_default="0"))
    op.add_column("client_profiles",
        sa.Column("longest_streak",  sa.Integer(), nullable=False, server_default="0"))
    op.add_column("client_profiles",
        sa.Column("last_logged_date", sa.String(), nullable=True))

    # ── PHI Encryption on HealthLog ─────────────────────────────────────────────
    op.add_column("health_logs",
        sa.Column("encrypted_payload", sa.Text(), nullable=True))
    op.add_column("health_logs",
        sa.Column("is_encrypted", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("client_profiles", "last_logged_date")
    op.drop_column("client_profiles", "longest_streak")
    op.drop_column("client_profiles", "current_streak")
    op.drop_column("health_logs", "is_encrypted")
    op.drop_column("health_logs", "encrypted_payload")
