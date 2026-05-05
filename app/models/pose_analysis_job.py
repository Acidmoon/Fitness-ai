from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text

from app.database import Base
from app.utils.datetime import utc_now

POSE_ANALYSIS_JOB_STATUS_QUEUED = "queued"
POSE_ANALYSIS_JOB_STATUS_RUNNING = "running"
POSE_ANALYSIS_JOB_STATUS_SUCCEEDED = "succeeded"
POSE_ANALYSIS_JOB_STATUS_FAILED = "failed"


class PoseAnalysisJob(Base):
    """Persisted job state for asynchronous pose analysis."""

    __tablename__ = "pose_analysis_jobs"

    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(Integer, ForeignKey("records.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False, index=True)
    error = Column(Text, nullable=True)
    result_summary = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, nullable=False)
    completed_at = Column(DateTime, nullable=True)
