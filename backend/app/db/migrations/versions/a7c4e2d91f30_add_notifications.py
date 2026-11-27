"""add_notifications

In-app notifications (shared by admins, or scoped to one supplier) and
per-reader read state.

Revision ID: a7c4e2d91f30
Revises: f3d1a7c2b9e4
Create Date: 2026-11-27 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a7c4e2d91f30'
down_revision: Union[str, None] = 'f3d1a7c2b9e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('recipient_type', sa.String(length=16), nullable=False),
        sa.Column(
            'supplier_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('suppliers.id', ondelete='CASCADE'),
            nullable=True,
        ),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('title_key', sa.String(length=100), nullable=False),
        sa.Column('params', postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('link', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index(
        'ix_notifications_audience_created',
        'notifications',
        ['recipient_type', 'supplier_id', 'created_at'],
    )

    op.create_table(
        'notification_reads',
        sa.Column(
            'notification_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('notifications.id', ondelete='CASCADE'),
            primary_key=True,
        ),
        sa.Column('reader_id', sa.String(length=64), primary_key=True),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )


def downgrade() -> None:
    op.drop_table('notification_reads')
    op.drop_index('ix_notifications_audience_created', table_name='notifications')
    op.drop_table('notifications')
