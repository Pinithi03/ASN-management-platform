"""make_user_company_id_nullable

Revision ID: afae7ae87998
Revises: 015611883854
Create Date: 2026-10-07 03:47:04.351591

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'afae7ae87998'
down_revision: Union[str, None] = '015611883854'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
