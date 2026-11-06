"""add_supplier_preferred_language

Revision ID: f3d1a7c2b9e4
Revises: e429d64b0246
Create Date: 2026-11-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f3d1a7c2b9e4'
down_revision: Union[str, None] = 'e429d64b0246'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) NOT NULL DEFAULT 'en';"
    )


def downgrade() -> None:
    op.drop_column('suppliers', 'preferred_language')
