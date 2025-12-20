"""add account lockout fields

Revision ID: 2a9f7d9f1c4b
Revises: 01be29afe5a3
Create Date: 2025-12-20 18:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2a9f7d9f1c4b'
down_revision: Union[str, Sequence[str], None] = '01be29afe5a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('failed_attempts', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('last_failed_at', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('locked_until', sa.DateTime(), nullable=True))
    # set defaults for existing rows
    op.execute("UPDATE users SET failed_attempts = 0 WHERE failed_attempts IS NULL")


def downgrade() -> None:
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'last_failed_at')
    op.drop_column('users', 'failed_attempts')
