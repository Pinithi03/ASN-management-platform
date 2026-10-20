"""add_missing_supplier_columns

Revision ID: e429d64b0246
Revises: c92b8d4e5f23
Create Date: 2026-10-14 11:19:50.200277

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e429d64b0246'
down_revision: Union[str, None] = 'c92b8d4e5f23'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);")
    op.execute("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category VARCHAR(100);")
    op.execute("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;")
    op.execute("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;")


def downgrade() -> None:
    op.drop_column('suppliers', 'deleted_at')
    op.drop_column('suppliers', 'is_deleted')
    op.drop_column('suppliers', 'category')
    op.drop_column('suppliers', 'tax_id')
