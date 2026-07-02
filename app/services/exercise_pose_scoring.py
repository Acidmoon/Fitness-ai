from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence

from app.models.exercise import Exercise, ExerciseRecord
from app.services.exercise_rules import (
    AngleSample,
    ExerciseRule,
    JointTriplet,
    PhaseSummary,
    PoseScoringUnavailableError,
    find_rule_for_exercise,
)
from app.services.exercise_rules.base import (
    extract_threshold_phases,
    keypoints_have_confidence,
)
from app.services.video_pose_analysis import POSE_ANALYSIS_SCHEMA_VERSION


class PoseScoringError(Exception):
    """Base error for pose scoring failures."""


def score_record_pose(record: ExerciseRecord) -> Dict[str, Any]:
    exercise = record.exercise
    if exercise is None:
        raise PoseScoringUnavailableError("记录缺少动作信息")

    rule = find_scoring_rule(exercise)
    if rule is None:
        return {
            "status": "unsupported",
            "applied": False,
            "exercise_type": None,
            "score": None,
            "count": None,
            "confidence": None,
            "feedback": ["当前动作暂不支持姿态评分"],
            "metrics": {},
        }

    pose_data = _validated_pose_data(record.keypoints_data)
    frames = pose_data.get("frames") or []
    angle_samples = extract_angle_samples(frames, rule)
    if len(angle_samples) < rule.min_valid_frames:
        raise PoseScoringUnavailableError("关键点置信度不足，无法生成可靠评分")

    phase_summary = extract_phase_summary(angle_samples, rule)
    score, feedback = score_phase_summary(phase_summary, rule)

    return {
        "status": "scored",
        "applied": False,
        "exercise_type": rule.exercise_type,
        "score": score,
        "count": phase_summary.repetitions,
        "auto_count": phase_summary.repetitions,
        "count_source": phase_summary.count_source,
        "confidence": round(phase_summary.average_confidence, 4),
        "feedback": feedback,
        "metrics": {
            "valid_frames": len(angle_samples),
            "min_angle": round(phase_summary.min_angle, 2),
            "max_angle": round(phase_summary.max_angle, 2),
            "angle_range": round(phase_summary.angle_range, 2),
            "phases": phase_summary.phases,
            "valid_reps": phase_summary.repetition_details or [],
            "invalid_reps": phase_summary.invalid_repetition_details or [],
            "repetitions": phase_summary.repetition_details or [],
            "count_source": phase_summary.count_source,
        },
    }


def apply_pose_scoring_result(
    record: ExerciseRecord, scoring_result: Dict[str, Any]
) -> None:
    if scoring_result.get("status") != "scored":
        raise PoseScoringUnavailableError("当前评分结果不可应用")

    record.score = float(scoring_result["score"])
    record.count = int(scoring_result["count"])
    record.feedback = "\n".join(scoring_result.get("feedback") or [])


def find_scoring_rule(exercise: Exercise) -> Optional[ScoringRule]:
    return find_rule_for_exercise(exercise)


def calculate_joint_angle(
    keypoints_by_name: Dict[str, Dict[str, Any]], start: str, middle: str, end: str
) -> float:
    start_point = keypoints_by_name[start]
    middle_point = keypoints_by_name[middle]
    end_point = keypoints_by_name[end]

    vector_a = (
        float(start_point["x"]) - float(middle_point["x"]),
        float(start_point["y"]) - float(middle_point["y"]),
    )
    vector_b = (
        float(end_point["x"]) - float(middle_point["x"]),
        float(end_point["y"]) - float(middle_point["y"]),
    )
    magnitude_a = math.hypot(*vector_a)
    magnitude_b = math.hypot(*vector_b)
    if magnitude_a == 0 or magnitude_b == 0:
        raise PoseScoringUnavailableError("关键点坐标重合，无法计算关节角")

    cosine = (vector_a[0] * vector_b[0] + vector_a[1] * vector_b[1]) / (
        magnitude_a * magnitude_b
    )
    return math.degrees(math.acos(max(-1.0, min(1.0, cosine))))


def extract_angle_samples(
    frames: Sequence[Dict[str, Any]], rule: ExerciseRule
) -> List[AngleSample]:
    samples: List[AngleSample] = []
    for frame in frames:
        keypoints_by_name = _index_keypoints(frame.get("keypoints") or [])
        triplet_angles: List[float] = []
        triplet_confidences: List[float] = []

        for triplet in rule.joint_triplets:
            triplet_names = (triplet.start, triplet.middle, triplet.end)
            if not keypoints_have_confidence(
                keypoints_by_name, triplet_names, rule.min_confidence
            ):
                continue

            triplet_angles.append(
                calculate_joint_angle(
                    keypoints_by_name, triplet.start, triplet.middle, triplet.end
                )
            )
            triplet_confidences.extend(
                float(keypoints_by_name[name].get("score", 0)) for name in triplet_names
            )

        if triplet_angles:
            samples.append(
                AngleSample(
                    frame_index=int(frame.get("frame_index", len(samples))),
                    timestamp_ms=int(frame.get("timestamp_ms", 0)),
                    angle=sum(triplet_angles) / len(triplet_angles),
                    confidence=sum(triplet_confidences) / len(triplet_confidences),
                )
            )

    return samples


def extract_movement_phases(
    angle_samples: Sequence[AngleSample], down_angle: float, up_angle: float
) -> PhaseSummary:
    return extract_threshold_phases(angle_samples, down_angle, up_angle)


def extract_phase_summary(
    angle_samples: Sequence[AngleSample], rule: ExerciseRule
) -> PhaseSummary:
    return rule.summarize_phases(angle_samples)


def score_phase_summary(
    phase_summary: PhaseSummary, rule: ExerciseRule
) -> tuple[float, List[str]]:
    score = 100.0
    feedback: List[str] = []

    if phase_summary.min_angle > rule.target_angle:
        deduction = min(
            35.0, (phase_summary.min_angle - rule.target_angle) * rule.depth_penalty_rate
        )
        score -= deduction
        feedback.append("动作幅度不足，最低点关节角仍偏大")

    if phase_summary.max_angle < rule.up_angle:
        deduction = min(
            20.0, (rule.up_angle - phase_summary.max_angle) * rule.extension_penalty_rate
        )
        score -= deduction
        feedback.append("复位不充分，最高点未达到伸展阈值")

    if phase_summary.angle_range < rule.min_range:
        deduction = min(
            25.0, (rule.min_range - phase_summary.angle_range) * rule.range_penalty_rate
        )
        score -= deduction
        feedback.append("动作行程不足，建议扩大上下阶段差异")

    if phase_summary.repetitions == 0:
        score -= rule.no_repetition_penalty
        feedback.append("未检测到完整的下放-复位动作周期")

    if phase_summary.average_confidence < rule.low_confidence_threshold:
        score -= rule.low_confidence_penalty
        feedback.append("关键点平均置信度偏低，建议调整拍摄角度和光照")

    if not feedback:
        feedback.append("动作轨迹完整，主要关节角度达到当前规则要求")

    return round(max(0.0, min(100.0, score)), 2), feedback


def _validated_pose_data(keypoints_data: Any) -> Dict[str, Any]:
    if not isinstance(keypoints_data, dict):
        raise PoseScoringUnavailableError("记录缺少姿态分析数据")

    if keypoints_data.get("schema_version") != POSE_ANALYSIS_SCHEMA_VERSION:
        raise PoseScoringUnavailableError("姿态分析结果版本已过期，请重新分析")

    if keypoints_data.get("status") != "done":
        raise PoseScoringUnavailableError("姿态分析尚未成功完成")

    if not keypoints_data.get("frames"):
        raise PoseScoringUnavailableError("姿态分析结果缺少采样帧")

    return keypoints_data


def _index_keypoints(keypoints: Sequence[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {
        str(keypoint.get("name")): keypoint
        for keypoint in keypoints
        if keypoint.get("name")
    }


ScoringRule = ExerciseRule
