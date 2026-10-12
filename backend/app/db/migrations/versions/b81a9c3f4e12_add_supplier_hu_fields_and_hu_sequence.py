"""add_supplier_hu_fields_and_hu_sequence

Revision ID: b81a9c3f4e12
Revises: afae7ae87998
Create Date: 2026-10-12 12:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b81a9c3f4e12'
down_revision: Union[str, None] = 'afae7ae87998'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add current_hu_number and hu_locked to suppliers
    op.add_column('suppliers', sa.Column('current_hu_number', sa.String(length=50), nullable=True))
    op.add_column('suppliers', sa.Column('hu_locked', sa.Boolean(), server_default='false', nullable=False))

    # Create hu_sequences table if not exists
    op.create_table(
        'hu_sequences',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('supplier_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('suppliers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('last_number', sa.BigInteger(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(op.f('ix_hu_sequences_supplier_id'), 'hu_sequences', ['supplier_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_hu_sequences_supplier_id'), table_name='hu_sequences')
    op.drop_table('hu_sequences')
    op.drop_column('suppliers', 'hu_locked')
    op.drop_column('suppliers', 'current_hu_number')
