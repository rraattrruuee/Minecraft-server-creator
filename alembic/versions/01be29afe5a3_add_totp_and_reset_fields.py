"""add totp and reset fields

Revision ID: 01be29afe5a3_totp_reset
Revises: 2a9f7d9f1c4b
Create Date: 2025-12-20 19:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '01be29afe5a3_totp_reset'
down_revision: Union[str, Sequence[str], None] = '2a9f7d9f1c4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('totp_secret', sa.String(length=128), nullable=True))
    op.add_column('users', sa.Column('totp_enabled', sa.Boolean(), nullable=True))
    op.add_column('users', sa.Column('reset_token', sa.String(length=128), nullable=True))
    op.add_column('users', sa.Column('reset_expires', sa.DateTime(), nullable=True))
    op.execute("UPDATE users SET totp_enabled = 0 WHERE totp_enabled IS NULL")


def downgrade() -> None:
    op.drop_column('users', 'reset_expires')
    op.drop_column('users', 'reset_token')
    op.drop_column('users', 'totp_enabled')
    op.drop_column('users', 'totp_secret')
