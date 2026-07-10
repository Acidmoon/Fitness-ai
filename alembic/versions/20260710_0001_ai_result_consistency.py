"""Add versioned AI results, job idempotency, and cascading ownership cleanup."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260710_0001"
down_revision: Union[str, Sequence[str], None] = "20260710_0000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NAMING_CONVENTION = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
}


def _foreign_key_name(table_name: str, column_name: str) -> str:
    """Return an existing FK name, including a deterministic name for SQLite."""
    inspector = sa.inspect(op.get_bind())
    for foreign_key in inspector.get_foreign_keys(table_name):
        if foreign_key["constrained_columns"] == [column_name]:
            return foreign_key["name"] or (
                f"fk_{table_name}_{column_name}_{foreign_key['referred_table']}"
            )
    raise RuntimeError(f"Missing foreign key for {table_name}.{column_name}")


def _replace_foreign_key(
    table_name: str,
    column_name: str,
    referred_table: str,
    *,
    ondelete: str | None,
) -> None:
    existing_name = _foreign_key_name(table_name, column_name)
    target_name = f"fk_{table_name}_{column_name}_{referred_table}"
    with op.batch_alter_table(
        table_name,
        naming_convention=NAMING_CONVENTION,
    ) as batch_op:
        batch_op.drop_constraint(existing_name, type_="foreignkey")
        batch_op.create_foreign_key(
            target_name,
            referred_table,
            [column_name],
            ["id"],
            ondelete=ondelete,
        )


def upgrade() -> None:
    with op.batch_alter_table("records") as batch_op:
        batch_op.add_column(sa.Column("manual_score", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("manual_count", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("score_source", sa.String(length=20), nullable=True)
        )
        batch_op.add_column(
            sa.Column("count_source", sa.String(length=20), nullable=True)
        )
        batch_op.add_column(sa.Column("video_revision", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("analysis_revision", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("analysis_model", sa.String(length=100), nullable=True)
        )
        batch_op.add_column(
            sa.Column("analysis_rule_version", sa.String(length=100), nullable=True)
        )
        batch_op.add_column(
            sa.Column("analysis_updated_at", sa.DateTime(), nullable=True)
        )

    op.execute(sa.text("""
            UPDATE records
            SET manual_score = score,
                manual_count = count,
                score_source = 'manual',
                count_source = 'manual',
                video_revision = 0,
                analysis_revision = CASE
                    WHEN keypoints_data IS NOT NULL THEN 0
                    ELSE NULL
                END
            """))

    with op.batch_alter_table("records") as batch_op:
        batch_op.alter_column(
            "score_source",
            existing_type=sa.String(length=20),
            nullable=False,
        )
        batch_op.alter_column(
            "count_source",
            existing_type=sa.String(length=20),
            nullable=False,
        )
        batch_op.alter_column(
            "video_revision",
            existing_type=sa.Integer(),
            nullable=False,
        )

    with op.batch_alter_table("pose_analysis_jobs") as batch_op:
        batch_op.add_column(sa.Column("video_revision", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("sample_fps", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("result_data", sa.JSON(), nullable=True))

    op.execute(sa.text("""
            UPDATE pose_analysis_jobs
            SET video_revision = 0
            WHERE video_revision IS NULL
            """))
    op.execute(sa.text("""
            UPDATE pose_analysis_jobs
            SET status = 'cancelled',
                error = COALESCE(error, '迁移时取消重复活动任务'),
                completed_at = COALESCE(completed_at, updated_at)
            WHERE status IN ('queued', 'running')
              AND id NOT IN (
                  SELECT MAX(id)
                  FROM pose_analysis_jobs
                  WHERE status IN ('queued', 'running')
                  GROUP BY record_id
              )
            """))

    with op.batch_alter_table("pose_analysis_jobs") as batch_op:
        batch_op.alter_column(
            "video_revision",
            existing_type=sa.Integer(),
            nullable=False,
        )

    _replace_foreign_key("records", "user_id", "users", ondelete="CASCADE")
    _replace_foreign_key(
        "pose_analysis_jobs",
        "record_id",
        "records",
        ondelete="CASCADE",
    )
    _replace_foreign_key(
        "pose_analysis_jobs",
        "user_id",
        "users",
        ondelete="CASCADE",
    )

    active_filter = sa.text("status IN ('queued', 'running')")
    op.create_index(
        "uq_pose_analysis_jobs_active_record",
        "pose_analysis_jobs",
        ["record_id"],
        unique=True,
        postgresql_where=active_filter,
        sqlite_where=active_filter,
    )


def downgrade() -> None:
    op.drop_index(
        "uq_pose_analysis_jobs_active_record",
        table_name="pose_analysis_jobs",
    )
    _replace_foreign_key("records", "user_id", "users", ondelete=None)
    _replace_foreign_key(
        "pose_analysis_jobs",
        "record_id",
        "records",
        ondelete=None,
    )
    _replace_foreign_key(
        "pose_analysis_jobs",
        "user_id",
        "users",
        ondelete=None,
    )

    with op.batch_alter_table("pose_analysis_jobs") as batch_op:
        batch_op.drop_column("result_data")
        batch_op.drop_column("sample_fps")
        batch_op.drop_column("video_revision")

    with op.batch_alter_table("records") as batch_op:
        batch_op.drop_column("analysis_updated_at")
        batch_op.drop_column("analysis_rule_version")
        batch_op.drop_column("analysis_model")
        batch_op.drop_column("analysis_revision")
        batch_op.drop_column("video_revision")
        batch_op.drop_column("count_source")
        batch_op.drop_column("score_source")
        batch_op.drop_column("manual_count")
        batch_op.drop_column("manual_score")
