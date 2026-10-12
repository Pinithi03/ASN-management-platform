"""add_supplier_profile_picture_url

Revision ID: c92b8d4e5f23
Revises: b81a9c3f4e12
Create Date: 2026-10-12 16:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c92b8d4e5f23'
down_revision: Union[str, None] = 'b81a9c3f4e12'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;")


def downgrade() -> None:
    op.drop_column('suppliers', 'profile_picture_url')
