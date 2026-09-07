"""Persistence-facing adapters for the pure pose-scoring engine.

Pure scoring lives in :mod:`app.services.pose_scoring_engine`; this module
bridges scoring results onto ``ExerciseRecord`` (manual/AI provenance rules)
and re-exports the historical public API so existing callers keep working.
"""

from __future__ import annotations

from typing import Any, Dict

from app.models.exercise import ExerciseRecord
from app.services.exercise_rules import AngleSample, PoseScoringUnavailableError
from app.services.pose_scoring_engine import (
    QUALITY_SCORE_VERSION,
    QUALITY_WEIGHTS,
    VIDEO_QUALITY_VERSION,
    PoseScoringError,
    ScoringRule,
    build_standard_quality_feedback,
    build_standard_quality_score,
    build_video_quality_score,
    calculate_joint_angle,
    extract_angle_samples,
    extract_movement_phases,
    extract_phase_summary,
    find_scoring_rule,
    keypoints_have_confidence,
    score_phase_summary,
    score_pose_data,
)
from app.services.record_analysis_state import MEASUREMENT_SOURCE_AI
from app.utils.datetime import utc_now

__all__ = [
    "QUALITY_SCORE_VERSION",
    "QUALITY_WEIGHTS",
    "VIDEO_QUALITY_VERSION",
    "AngleSample",
    "PoseScoringError",
    "PoseScoringUnavailableError",
    "ScoringRule",
    "apply_pose_scoring_result",
    "build_standard_quality_feedback",
    "build_standard_quality_score",
    "build_video_quality_score",
    "calculate_joint_angle",
    "extract_angle_samples",
    "extract_movement_phases",
    "extract_phase_summary",
    "find_scoring_rule",
    "keypoints_have_confidence",
    "score_phase_summary",
    "score_pose_data",
    "score_record_pose",
]


def score_record_pose(record: ExerciseRecord) -> Dict[str, Any]:
    exercise = record.exercise
    if exercise is None:
        raise PoseScoringUnavailableError("记录缺少动作信息")
    if (
        record.keypoints_data is not None
        and record.analysis_revision != record.video_revision
    ):
        raise PoseScoringUnavailableError("姿态分析结果已过期，请重新分析当前视频")

    return score_pose_data(exercise, record.keypoints_data)


def apply_pose_scoring_result(
    record: ExerciseRecord, scoring_result: Dict[str, Any]
) -> None:
    if scoring_result.get("status") != "scored":
        raise PoseScoringUnavailableError("当前评分结果不可应用")

    if record.manual_score is None:
        record.manual_score = record.score
    if record.manual_count is None:
        record.manual_count = record.count
    record.score = float(scoring_result["score"])
    record.count = int(scoring_result["count"])
    record.score_source = MEASUREMENT_SOURCE_AI
    record.count_source = MEASUREMENT_SOURCE_AI
    record.feedback = "\n".join(scoring_result.get("feedback") or [])
    record.analysis_rule_version = scoring_result.get("rule_version")
    record.analysis_updated_at = utc_now()
