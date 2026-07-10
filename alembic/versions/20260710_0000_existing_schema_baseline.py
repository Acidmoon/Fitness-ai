"""Create the schema that existed before Alembic adoption.

Existing deployments must stamp this revision instead of executing it:
`alembic stamp 20260710_0000`.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260710_0000"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=100), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "exercises",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("standard", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_exercises_id", "exercises", ["id"])

    op.create_table(
        "records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("exercise_id", sa.Integer(), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("count", sa.Integer(), nullable=True),
        sa.Column("duration", sa.Integer(), nullable=True),
        sa.Column("heart_rate_avg", sa.Float(), nullable=True),
        sa.Column("heart_rate_max", sa.Float(), nullable=True),
        sa.Column("video_url", sa.String(length=255), nullable=True),
        sa.Column("keypoints_data", sa.JSON(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_records_id", "records", ["id"])
    op.create_index("ix_records_created_at", "records", ["created_at"])

    op.create_table(
        "pose_analysis_jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("record_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("result_summary", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["record_id"], ["records.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pose_analysis_jobs_id", "pose_analysis_jobs", ["id"])
    op.create_index(
        "ix_pose_analysis_jobs_record_id",
        "pose_analysis_jobs",
        ["record_id"],
    )
    op.create_index(
        "ix_pose_analysis_jobs_user_id",
        "pose_analysis_jobs",
        ["user_id"],
    )
    op.create_index(
        "ix_pose_analysis_jobs_status",
        "pose_analysis_jobs",
        ["status"],
    )


def downgrade() -> None:
    op.drop_table("pose_analysis_jobs")
    op.drop_table("records")
    op.drop_table("exercises")
    op.drop_table("users")
