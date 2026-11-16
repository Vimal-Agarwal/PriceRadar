"""initial schema - users, products, price_history

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-06-30

"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("nickname", sa.String(length=255), nullable=True),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("image", sa.String(length=2048), nullable=True),
        sa.Column("currency", sa.String(length=5), server_default="₹"),
        sa.Column("current_price", sa.Float(), nullable=True),
        sa.Column("previous_price", sa.Float(), nullable=True),
        sa.Column("lowest_price", sa.Float(), nullable=True),
        sa.Column("highest_price", sa.Float(), nullable=True),
        sa.Column("target_price", sa.Float(), nullable=False),
        sa.Column("is_available", sa.Boolean(), server_default=sa.true()),
        sa.Column("tracking_enabled", sa.Boolean(), server_default=sa.true()),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
        sa.Column("last_scraped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_alerted_price", sa.Float(), nullable=True),
        sa.Column("last_alerted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scrape_error", sa.Text(), nullable=True),
        sa.Column("scrape_fail_count", sa.Integer(), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )

    op.create_table(
        "price_history",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("availability", sa.Boolean(), server_default=sa.true()),
        sa.Column("scraped_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("price_history")
    op.drop_table("products")
    op.drop_table("users")
