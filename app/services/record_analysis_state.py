"""State transitions that keep videos, pose results, and scores consistent."""

from __future__ import annotations

from typing import Any, Dict

from sqlalchemy.orm import Session

from app.models.exercise import ExerciseRecord
from app.models.pose_analysis_job import (
    POSE_ANALYSIS_ACTIVE_STATUSES,
    POSE_ANALYSIS_JOB_STATUS_CANCELLED,
    PoseAnalysisJob,
)
from app.utils.datetime import utc_now

MEASUREMENT_SOURCE_MANUAL = "manual"
MEASUREMENT_SOURCE_AI = "ai"


def initialize_manual_measurements(record: ExerciseRecord) -> None:
    """Capture user-entered measurements separately from future AI projections."""
    record.manual_score = record.score
    record.manual_count = record.count
    record.score_source = MEASUREMENT_SOURCE_MANUAL
    record.count_source = MEASUREMENT_SOURCE_MANUAL


def apply_manual_measurement_updates(
    record: ExerciseRecord, update_data: Dict[str, Any]
) -> None:
    """Apply editable fields while preserving the manual/AI provenance boundary."""
    for field, value in update_data.items():
        setattr(record, field, value)

    if "score" in update_data:
        record.manual_score = update_data["score"]
        record.score_source = MEASUREMENT_SOURCE_MANUAL
    if "count" in update_data:
        record.manual_count = update_data["count"]
        record.count_source = MEASUREMENT_SOURCE_MANUAL


def invalidate_record_analysis(
    record: ExerciseRecord,
    db: Session,
    *,
    reason: str,
) -> None:
    """Advance the video revision and invalidate every result derived from the old video."""
    record.video_revision = int(record.video_revision or 0) + 1
    record.keypoints_data = None
    record.analysis_revision = None
    record.analysis_model = None
    record.analysis_rule_version = None
    record.analysis_updated_at = None
    record.feedback = None

    if record.score_source == MEASUREMENT_SOURCE_AI:
        record.score = record.manual_score if record.manual_score is not None else 0
        record.score_source = MEASUREMENT_SOURCE_MANUAL
    if record.count_source == MEASUREMENT_SOURCE_AI:
        record.count = record.manual_count if record.manual_count is not None else 0
        record.count_source = MEASUREMENT_SOURCE_MANUAL

    now = utc_now()
    (
        db.query(PoseAnalysisJob)
        .filter(
            PoseAnalysisJob.record_id == record.id,
            PoseAnalysisJob.status.in_(POSE_ANALYSIS_ACTIVE_STATUSES),
        )
        .update(
            {
                PoseAnalysisJob.status: POSE_ANALYSIS_JOB_STATUS_CANCELLED,
                PoseAnalysisJob.error: reason,
                PoseAnalysisJob.updated_at: now,
                PoseAnalysisJob.completed_at: now,
            },
            synchronize_session=False,
        )
    )
