"""Guard concurrent record/job writes and preserve applied scoring evidence."""

from alembic import op
import sqlalchemy as sa

revision = "20260930_0002"
down_revision = "20260710_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("records", "pose_analysis_jobs"):
        op.add_column(
            table,
            sa.Column("row_version", sa.Integer(), nullable=False, server_default="1"),
        )
    op.add_column("records", sa.Column("scoring_data", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("records", "scoring_data")
    for table in ("pose_analysis_jobs", "records"):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("row_version")
