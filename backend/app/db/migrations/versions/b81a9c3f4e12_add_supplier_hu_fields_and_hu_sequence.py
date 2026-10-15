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
    # Add current_hu_number and hu_locked to suppliers if not exists
    op.execute("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS current_hu_number VARCHAR(50);")
    op.execute("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS hu_locked BOOLEAN NOT NULL DEFAULT FALSE;")

    # Create hu_sequences table if not exists
    op.execute("""
    CREATE TABLE IF NOT EXISTS hu_sequences (
        id UUID PRIMARY KEY,
        supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        last_number BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_hu_sequences_supplier_id ON hu_sequences (supplier_id);")


def downgrade() -> None:
    op.drop_index(op.f('ix_hu_sequences_supplier_id'), table_name='hu_sequences')
    op.drop_table('hu_sequences')
    op.drop_column('suppliers', 'hu_locked')
    op.drop_column('suppliers', 'current_hu_number')
