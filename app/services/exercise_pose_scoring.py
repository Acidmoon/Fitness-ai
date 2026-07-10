from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from app.models.exercise import Exercise, ExerciseRecord
from app.services.record_analysis_state import MEASUREMENT_SOURCE_AI
from app.utils.datetime import utc_now
from app.services.exercise_rules import (
    AngleSample,
    ExerciseRule,
    PhaseSummary,
    PoseScoringUnavailableError,
    find_rule_for_exercise,
)
from app.services.exercise_rules.base import extract_threshold_phases
from app.services import pose_features
from app.services.pose_features import (
    PoseFeatureError,
    extract_body_line_samples,
    extract_angle_samples as extract_pose_angle_samples,
    extract_symmetry_samples,
)
from app.services.pose_error_detection import detect_pose_errors
from app.services.video_pose_analysis import POSE_ANALYSIS_SCHEMA_VERSION

calculate_joint_angle = pose_features.calculate_joint_angle
keypoints_have_confidence = pose_features.keypoints_have_confidence

QUALITY_SCORE_VERSION = "standard_quality_v1"
VIDEO_QUALITY_VERSION = "video_quality_v1"
QUALITY_WEIGHTS = {
    "joint_angle": 0.25,
    "body_alignment": 0.20,
    "movement_range": 0.20,
    "rhythm_stability": 0.15,
    "left_right_symmetry": 0.10,
    "keyframe_confidence": 0.10,
}


class PoseScoringError(Exception):
    """Base error for pose scoring failures."""


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


def score_pose_data(exercise: Exercise, keypoints_data: Any) -> Dict[str, Any]:
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

    pose_data = _validated_pose_data(keypoints_data)
    frames = pose_data.get("frames") or []
    angle_samples = extract_angle_samples(frames, rule)
    video_quality = build_video_quality_score(frames, angle_samples, rule)
    if len(angle_samples) < rule.min_valid_frames:
        feedback = video_quality.get("feedback") or [
            "关键点置信度不足，无法生成可靠评分"
        ]
        raise PoseScoringUnavailableError(feedback[0])

    phase_summary = extract_phase_summary(angle_samples, rule)
    quality = build_standard_quality_score(frames, angle_samples, phase_summary, rule)
    quality["video"] = video_quality
    errors = detect_pose_errors(frames, angle_samples, phase_summary, rule)
    score = quality["score"]
    analysis_config = (exercise.standard or {}).get("analysis") or {}
    rule_version = analysis_config.get("rule_version") or f"{rule.exercise_type}-v1"
    feedback = _merge_feedback(
        build_standard_quality_feedback(quality),
        video_quality.get("feedback") or [],
        [error["feedback"] for error in errors],
    )

    return {
        "status": "scored",
        "applied": False,
        "exercise_type": rule.exercise_type,
        "rule_version": rule_version,
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
            "quality": quality,
            "errors": errors,
        },
    }


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


def find_scoring_rule(exercise: Exercise) -> Optional[ScoringRule]:
    return find_rule_for_exercise(exercise)


def extract_angle_samples(
    frames: Sequence[Dict[str, Any]], rule: ExerciseRule
) -> List[AngleSample]:
    try:
        return extract_pose_angle_samples(
            frames,
            joint_triplets=rule.joint_triplets,
            min_confidence=rule.min_confidence,
        )
    except PoseFeatureError as exc:
        raise PoseScoringUnavailableError(str(exc)) from exc


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
    quality = build_standard_quality_score([], [], phase_summary, rule)
    return quality["score"], build_standard_quality_feedback(quality)


def build_standard_quality_score(
    frames: Sequence[Dict[str, Any]],
    angle_samples: Sequence[AngleSample],
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> Dict[str, Any]:
    """Build the explainable six-dimension standard-quality score."""
    dimensions = {
        "joint_angle": _score_joint_angle_dimension(phase_summary, rule),
        "body_alignment": _score_body_alignment_dimension(frames, rule),
        "movement_range": _score_movement_range_dimension(phase_summary, rule),
        "rhythm_stability": _score_rhythm_dimension(phase_summary),
        "left_right_symmetry": _score_symmetry_dimension(frames, rule),
        "keyframe_confidence": _score_keyframe_confidence_dimension(phase_summary),
    }
    weighted_score = sum(
        dimensions[name]["score"] * QUALITY_WEIGHTS[name] for name in QUALITY_WEIGHTS
    )

    if phase_summary.repetitions == 0:
        weighted_score = min(weighted_score, 70.0)

    return {
        "version": QUALITY_SCORE_VERSION,
        "score": round(_clamp_score(weighted_score), 2),
        "weights": QUALITY_WEIGHTS,
        "dimensions": dimensions,
    }


def build_standard_quality_feedback(quality: Dict[str, Any]) -> List[str]:
    feedback: List[str] = []
    dimensions = quality.get("dimensions") or {}
    for name in QUALITY_WEIGHTS:
        dimension = dimensions.get(name) or {}
        if float(dimension.get("score", 100.0)) < 85.0:
            feedback.extend(dimension.get("feedback") or [])

    if not feedback:
        feedback.append("动作轨迹完整，主要关节角度达到当前规则要求")

    return feedback


def build_video_quality_score(
    frames: Sequence[Dict[str, Any]],
    angle_samples: Sequence[AngleSample],
    rule: ExerciseRule,
) -> Dict[str, Any]:
    """Summarize whether sampled video frames can support reliable pose scoring."""
    total_frames = len(frames)
    required_keypoints = tuple(rule.required_keypoints)
    valid_frame_count = len(angle_samples)
    valid_frame_ratio = (valid_frame_count / total_frames) if total_frames else 0.0
    average_confidence = (
        sum(sample.confidence for sample in angle_samples) / valid_frame_count
        if valid_frame_count
        else 0.0
    )

    missing_counts = {name: 0 for name in required_keypoints}
    for frame in frames:
        keypoints_by_name = pose_features.index_keypoints(frame.get("keypoints") or [])
        for name in required_keypoints:
            if name not in keypoints_by_name:
                missing_counts[name] += 1

    missing_required_keypoints = [
        {
            "name": name,
            "missing_frames": count,
            "missing_ratio": round(count / total_frames, 4) if total_frames else 1.0,
        }
        for name, count in missing_counts.items()
        if count > 0
    ]

    feedback: List[str] = []
    status = "ok"
    if total_frames == 0:
        status = "invalid"
        feedback.append("视频没有可用的姿态采样帧，请重新上传清晰完整的视频")
    elif valid_frame_count < rule.min_valid_frames:
        status = "invalid"
        feedback.append("有效姿态帧不足，建议保持全身入镜并重新拍摄")
    else:
        if valid_frame_ratio < 0.6:
            status = "warning"
            feedback.append("部分采样帧无法识别关键点，评分可信度可能下降")
        if average_confidence < rule.low_confidence_threshold:
            status = "warning"
            feedback.append("关键点平均置信度偏低，建议改善光照、距离和拍摄角度")
        if missing_required_keypoints:
            status = "warning"
            feedback.append("部分必需关键点缺失，建议保持目标关节完整入镜")

    return {
        "version": VIDEO_QUALITY_VERSION,
        "status": status,
        "average_keypoint_confidence": round(average_confidence, 4),
        "valid_frame_ratio": round(valid_frame_ratio, 4),
        "total_frames": total_frames,
        "valid_frames": valid_frame_count,
        "min_required_valid_frames": rule.min_valid_frames,
        "min_required_confidence": rule.min_confidence,
        "missing_required_keypoints": missing_required_keypoints,
        "feedback": feedback,
    }


def _merge_feedback(*feedback_groups: Sequence[str]) -> List[str]:
    merged: List[str] = []
    seen = set()
    for group in feedback_groups:
        for item in group:
            if item not in seen:
                merged.append(item)
                seen.add(item)
    return merged


def _score_joint_angle_dimension(
    phase_summary: PhaseSummary, rule: ExerciseRule
) -> Dict[str, Any]:
    score = 100.0
    feedback: List[str] = []

    if phase_summary.min_angle > rule.target_angle:
        deduction = min(
            35.0,
            (phase_summary.min_angle - rule.target_angle) * rule.depth_penalty_rate,
        )
        score -= deduction
        feedback.append("动作幅度不足，最低点关节角仍偏大")

    if phase_summary.max_angle < rule.up_angle:
        deduction = min(
            20.0,
            (rule.up_angle - phase_summary.max_angle) * rule.extension_penalty_rate,
        )
        score -= deduction
        feedback.append("复位不充分，最高点未达到伸展阈值")

    if phase_summary.repetitions == 0:
        score = min(score, 70.0)
        feedback.append("未检测到完整的下放-复位动作周期")

    return {
        "score": round(_clamp_score(score), 2),
        "metrics": {
            "min_angle": round(phase_summary.min_angle, 2),
            "max_angle": round(phase_summary.max_angle, 2),
            "target_angle": rule.target_angle,
            "up_angle": rule.up_angle,
            "valid_repetitions": phase_summary.repetitions,
        },
        "feedback": feedback,
    }


def _score_movement_range_dimension(
    phase_summary: PhaseSummary, rule: ExerciseRule
) -> Dict[str, Any]:
    score = 100.0
    feedback: List[str] = []

    if phase_summary.angle_range < rule.min_range:
        deduction = min(
            25.0, (rule.min_range - phase_summary.angle_range) * rule.range_penalty_rate
        )
        score -= deduction
        feedback.append("动作行程不足，建议扩大上下阶段差异")

    return {
        "score": round(_clamp_score(score), 2),
        "metrics": {
            "angle_range": round(phase_summary.angle_range, 2),
            "min_required_range": rule.min_range,
        },
        "feedback": feedback,
    }


def _score_body_alignment_dimension(
    frames: Sequence[Dict[str, Any]], rule: ExerciseRule
) -> Dict[str, Any]:
    samples = extract_body_line_samples(frames, min_confidence=rule.min_confidence)
    if not samples:
        return _neutral_dimension("缺少肩-髋-踝完整链路，身体直线度暂按中性处理")

    average_deviation = sum(sample.deviation for sample in samples) / len(samples)
    max_deviation = max(sample.deviation for sample in samples)
    score = 100.0 - min(45.0, max(0.0, average_deviation - 8.0) * 2.8)
    feedback = []
    if score < 85.0:
        feedback.append("身体直线度不足，肩、髋、踝没有保持稳定直线")

    return {
        "score": round(_clamp_score(score), 2),
        "metrics": {
            "sample_count": len(samples),
            "average_deviation": round(average_deviation, 2),
            "max_deviation": round(max_deviation, 2),
        },
        "feedback": feedback,
    }


def _score_rhythm_dimension(phase_summary: PhaseSummary) -> Dict[str, Any]:
    durations = [
        int(rep["duration_ms"])
        for rep in phase_summary.repetition_details
        if rep.get("duration_ms") is not None
    ]
    if phase_summary.repetitions == 0:
        return {
            "score": 0.0,
            "metrics": {"valid_repetitions": 0, "duration_ms": []},
            "feedback": ["未形成完整动作周期，无法判断节奏稳定性"],
        }
    if len(durations) < 2:
        return _neutral_dimension("有效动作次数不足 2 次，节奏稳定性暂按中性处理")

    average_duration = sum(durations) / len(durations)
    variance = sum((duration - average_duration) ** 2 for duration in durations) / len(
        durations
    )
    coefficient_of_variation = (variance**0.5) / average_duration
    score = 100.0 - min(45.0, coefficient_of_variation * 220.0)
    feedback = []
    if score < 85.0:
        feedback.append("动作节奏波动较大，建议保持每次下放和复位速度一致")

    return {
        "score": round(_clamp_score(score), 2),
        "metrics": {
            "duration_ms": durations,
            "average_duration_ms": round(average_duration, 2),
            "coefficient_of_variation": round(coefficient_of_variation, 4),
        },
        "feedback": feedback,
    }


def _score_symmetry_dimension(
    frames: Sequence[Dict[str, Any]], rule: ExerciseRule
) -> Dict[str, Any]:
    left_triplet = next(
        (
            triplet
            for triplet in rule.joint_triplets
            if triplet.middle.startswith("left_")
        ),
        None,
    )
    right_triplet = next(
        (
            triplet
            for triplet in rule.joint_triplets
            if triplet.middle.startswith("right_")
        ),
        None,
    )
    if left_triplet is None or right_triplet is None:
        return _neutral_dimension("当前动作缺少可比较的左右关节组合")

    samples = extract_symmetry_samples(
        frames, left_triplet, right_triplet, min_confidence=rule.min_confidence
    )
    if not samples:
        return _neutral_dimension("缺少左右侧完整关键点，左右对称性暂按中性处理")

    average_difference = sum(sample.difference for sample in samples) / len(samples)
    max_difference = max(sample.difference for sample in samples)
    score = 100.0 - min(45.0, max(0.0, average_difference - 6.0) * 2.2)
    feedback = []
    if score < 85.0:
        feedback.append("左右关节角度差异偏大，建议保持两侧发力和动作幅度一致")

    return {
        "score": round(_clamp_score(score), 2),
        "metrics": {
            "sample_count": len(samples),
            "average_angle_difference": round(average_difference, 2),
            "max_angle_difference": round(max_difference, 2),
        },
        "feedback": feedback,
    }


def _score_keyframe_confidence_dimension(phase_summary: PhaseSummary) -> Dict[str, Any]:
    keyframe_confidences = [
        float(rep["average_confidence"])
        for rep in phase_summary.repetition_details
        if rep.get("average_confidence") is not None
    ]
    confidence = (
        sum(keyframe_confidences) / len(keyframe_confidences)
        if keyframe_confidences
        else phase_summary.average_confidence
    )
    score = min(100.0, max(0.0, confidence / 0.85 * 100.0))
    feedback = []
    if score < 85.0:
        feedback.append("关键帧置信度偏低，建议调整拍摄角度、距离和光照")

    return {
        "score": round(_clamp_score(score), 2),
        "metrics": {
            "average_keyframe_confidence": round(confidence, 4),
            "source": (
                "repetition_keyframes" if keyframe_confidences else "all_valid_frames"
            ),
        },
        "feedback": feedback,
    }


def _neutral_dimension(reason: str) -> Dict[str, Any]:
    return {"score": 100.0, "metrics": {"neutral_reason": reason}, "feedback": []}


def _clamp_score(value: float) -> float:
    return max(0.0, min(100.0, value))


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


ScoringRule = ExerciseRule
