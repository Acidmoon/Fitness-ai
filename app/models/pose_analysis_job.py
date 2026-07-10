from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    text,
)
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.datetime import utc_now

POSE_ANALYSIS_JOB_STATUS_QUEUED = "queued"
POSE_ANALYSIS_JOB_STATUS_RUNNING = "running"
POSE_ANALYSIS_JOB_STATUS_SUCCEEDED = "succeeded"
POSE_ANALYSIS_JOB_STATUS_FAILED = "failed"
POSE_ANALYSIS_JOB_STATUS_CANCELLED = "cancelled"
POSE_ANALYSIS_ACTIVE_STATUSES = (
    POSE_ANALYSIS_JOB_STATUS_QUEUED,
    POSE_ANALYSIS_JOB_STATUS_RUNNING,
)


class PoseAnalysisJob(Base):
    """Persisted job state for asynchronous pose analysis."""

    __tablename__ = "pose_analysis_jobs"
    __table_args__ = (
        Index(
            "uq_pose_analysis_jobs_active_record",
            "record_id",
            unique=True,
            postgresql_where=text("status IN ('queued', 'running')"),
            sqlite_where=text("status IN ('queued', 'running')"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(
        Integer,
        ForeignKey("records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status = Column(String(20), nullable=False, index=True)
    video_revision = Column(Integer, nullable=False, default=0)
    sample_fps = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
    result_summary = Column(JSON, nullable=True)
    result_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    record = relationship("ExerciseRecord", back_populates="pose_analysis_jobs")
    user = relationship("User", back_populates="pose_analysis_jobs")
