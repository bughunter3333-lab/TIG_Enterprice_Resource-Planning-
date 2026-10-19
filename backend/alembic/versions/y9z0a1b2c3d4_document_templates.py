"""document_templates — the designed layout of each printed document

One row per document type. The layout itself is stored as JSON text rather than
modelled in columns: the shape belongs to the renderer that reads it, and
putting it in columns would mean a migration every time a block gains an option.

An absent row means the document is still using its built-in default, so this
table starts empty and stays that way until someone edits a layout.

Revision ID: y9z0a1b2c3d4
Revises: x8y9z0a1b2c3
Create Date: 2026-08-30
"""

from alembic import op
import sqlalchemy as sa

revision = "y9z0a1b2c3d4"
down_revision = "x8y9z0a1b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_templates",
        sa.Column("doc_type", sa.String(length=40), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("spec", sa.Text(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("document_templates")
