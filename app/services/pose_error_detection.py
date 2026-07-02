from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence

from app.services.exercise_rules import AngleSample, ExerciseRule, PhaseSummary
from app.services.pose_features import (
    calculate_joint_angle,
    extract_body_line_samples,
    index_keypoints,
    keypoints_have_confidence,
)

PoseError = Dict[str, Any]


def detect_pose_errors(
    frames: Sequence[Dict[str, Any]],
    angle_samples: Sequence[AngleSample],
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> List[PoseError]:
    """Return rule-specific movement errors with stable codes and evidence."""
    if rule.exercise_type == "push_up":
        return _detect_pushup_errors(frames, phase_summary, rule)
    if rule.exercise_type == "squat":
        return _detect_squat_errors(frames, phase_summary, rule)

    return []


def _detect_pushup_errors(
    frames: Sequence[Dict[str, Any]],
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> List[PoseError]:
    errors: List[PoseError] = []

    insufficient_range = _build_insufficient_range_error(
        code="push_up_insufficient_range",
        label="俯卧撑幅度不足",
        feedback="俯卧撑幅度不足，建议下放到更低位置并完成顶部伸展",
        phase_summary=phase_summary,
        rule=rule,
    )
    if insufficient_range:
        errors.append(insufficient_range)

    body_line_error = _build_pushup_body_line_error(frames, rule)
    if body_line_error:
        errors.append(body_line_error)

    elbow_flare_error = _build_pushup_elbow_flare_error(frames, rule)
    if elbow_flare_error:
        errors.append(elbow_flare_error)

    return errors


def _detect_squat_errors(
    frames: Sequence[Dict[str, Any]],
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> List[PoseError]:
    errors: List[PoseError] = []

    insufficient_depth = _build_insufficient_range_error(
        code="squat_insufficient_depth",
        label="深蹲蹲深不足",
        feedback="深蹲蹲深不足，建议继续下蹲到目标膝关节角度",
        phase_summary=phase_summary,
        rule=rule,
    )
    if insufficient_depth:
        errors.append(insufficient_depth)

    knee_valgus_error = _build_squat_knee_valgus_error(frames, rule)
    if knee_valgus_error:
        errors.append(knee_valgus_error)

    forward_lean_error = _build_squat_forward_lean_error(frames, rule)
    if forward_lean_error:
        errors.append(forward_lean_error)

    return errors


def _build_insufficient_range_error(
    *,
    code: str,
    label: str,
    feedback: str,
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> Optional[PoseError]:
    reasons = _invalid_repetition_reasons(phase_summary)
    has_depth_issue = (
        phase_summary.min_angle > rule.target_angle
        or phase_summary.angle_range < rule.min_range
        or "insufficient_depth" in reasons
        or "insufficient_range" in reasons
    )
    if not has_depth_issue:
        return None

    gap = max(
        0.0,
        phase_summary.min_angle - rule.target_angle,
        rule.min_range - phase_summary.angle_range,
    )
    return _pose_error(
        code=code,
        label=label,
        severity=_severity(gap, minor_threshold=8.0, major_threshold=20.0),
        feedback=feedback,
        evidence={
            "min_angle": round(phase_summary.min_angle, 2),
            "target_angle": rule.target_angle,
            "angle_range": round(phase_summary.angle_range, 2),
            "min_required_range": rule.min_range,
            "invalid_repetition_reasons": sorted(reasons),
        },
    )


def _build_pushup_body_line_error(
    frames: Sequence[Dict[str, Any]], rule: ExerciseRule
) -> Optional[PoseError]:
    samples = extract_body_line_samples(frames, min_confidence=rule.min_confidence)
    if not samples:
        return None

    average_deviation = sum(sample.deviation for sample in samples) / len(samples)
    max_deviation = max(sample.deviation for sample in samples)
    if average_deviation <= 18.0:
        return None

    return _pose_error(
        code="push_up_sagging_waist",
        label="俯卧撑塌腰或撅臀",
        severity=_severity(average_deviation, minor_threshold=18.0, major_threshold=30.0),
        feedback="俯卧撑身体直线度不足，疑似塌腰或撅臀，建议收紧核心保持肩髋踝成线",
        evidence={
            "sample_count": len(samples),
            "average_body_line_deviation": round(average_deviation, 2),
            "max_body_line_deviation": round(max_deviation, 2),
        },
    )


def _build_pushup_elbow_flare_error(
    frames: Sequence[Dict[str, Any]], rule: ExerciseRule
) -> Optional[PoseError]:
    samples = _extract_pushup_elbow_flare_angles(frames, rule.min_confidence)
    if not samples:
        return None

    average_flare = sum(samples) / len(samples)
    max_flare = max(samples)
    if average_flare <= 35.0:
        return None

    return _pose_error(
        code="push_up_elbow_flare",
        label="俯卧撑手肘外展过大",
        severity=_severity(average_flare, minor_threshold=35.0, major_threshold=55.0),
        feedback="俯卧撑手肘外展过大，建议让上臂更靠近身体两侧，减少肩肘压力",
        evidence={
            "sample_count": len(samples),
            "average_elbow_flare_angle": round(average_flare, 2),
            "max_elbow_flare_angle": round(max_flare, 2),
        },
    )


def _build_squat_knee_valgus_error(
    frames: Sequence[Dict[str, Any]], rule: ExerciseRule
) -> Optional[PoseError]:
    samples = _extract_squat_knee_valgus_ratios(frames, rule.min_confidence)
    if not samples:
        return None

    average_ratio = sum(samples) / len(samples)
    max_ratio = max(samples)
    if average_ratio <= 0.15:
        return None

    return _pose_error(
        code="squat_knee_valgus",
        label="深蹲膝盖内扣",
        severity=_severity(average_ratio, minor_threshold=0.15, major_threshold=0.35),
        feedback="深蹲膝盖内扣，建议让膝盖方向跟脚尖一致并主动向外稳定",
        evidence={
            "sample_count": len(samples),
            "average_knee_valgus_ratio": round(average_ratio, 4),
            "max_knee_valgus_ratio": round(max_ratio, 4),
        },
    )


def _build_squat_forward_lean_error(
    frames: Sequence[Dict[str, Any]], rule: ExerciseRule
) -> Optional[PoseError]:
    samples = _extract_torso_forward_lean_angles(frames, rule.min_confidence)
    if not samples:
        return None

    average_lean = sum(samples) / len(samples)
    max_lean = max(samples)
    if average_lean <= 20.0:
        return None

    return _pose_error(
        code="squat_forward_lean",
        label="深蹲身体前倾过大",
        severity=_severity(average_lean, minor_threshold=20.0, major_threshold=35.0),
        feedback="深蹲身体前倾过大，建议挺胸收紧核心，保持躯干更稳定",
        evidence={
            "sample_count": len(samples),
            "average_torso_lean_angle": round(average_lean, 2),
            "max_torso_lean_angle": round(max_lean, 2),
        },
    )


def _extract_pushup_elbow_flare_angles(
    frames: Sequence[Dict[str, Any]], min_confidence: float
) -> List[float]:
    samples: List[float] = []
    side_configs = (
        ("left_hip", "left_shoulder", "left_elbow"),
        ("right_hip", "right_shoulder", "right_elbow"),
    )

    for frame in frames:
        keypoints_by_name = index_keypoints(frame.get("keypoints") or [])
        frame_angles: List[float] = []
        for triplet in side_configs:
            if not keypoints_have_confidence(keypoints_by_name, triplet, min_confidence):
                continue
            frame_angles.append(calculate_joint_angle(keypoints_by_name, *triplet))
        if frame_angles:
            samples.append(sum(frame_angles) / len(frame_angles))

    return samples


def _extract_squat_knee_valgus_ratios(
    frames: Sequence[Dict[str, Any]], min_confidence: float
) -> List[float]:
    samples: List[float] = []
    required = (
        "left_hip",
        "right_hip",
        "left_knee",
        "right_knee",
        "left_ankle",
        "right_ankle",
    )

    for frame in frames:
        keypoints_by_name = index_keypoints(frame.get("keypoints") or [])
        if not keypoints_have_confidence(keypoints_by_name, required, min_confidence):
            continue

        hip_width = _horizontal_distance(
            keypoints_by_name["left_hip"], keypoints_by_name["right_hip"]
        )
        knee_width = _horizontal_distance(
            keypoints_by_name["left_knee"], keypoints_by_name["right_knee"]
        )
        ankle_width = _horizontal_distance(
            keypoints_by_name["left_ankle"], keypoints_by_name["right_ankle"]
        )
        reference_width = max(hip_width, ankle_width, 1.0)
        inward_ratio = max(0.0, min(hip_width, ankle_width) - knee_width) / reference_width
        samples.append(inward_ratio)

    return samples


def _extract_torso_forward_lean_angles(
    frames: Sequence[Dict[str, Any]], min_confidence: float
) -> List[float]:
    samples: List[float] = []
    required = ("left_shoulder", "right_shoulder", "left_hip", "right_hip")

    for frame in frames:
        keypoints_by_name = index_keypoints(frame.get("keypoints") or [])
        if not keypoints_have_confidence(keypoints_by_name, required, min_confidence):
            continue

        shoulder_midpoint = _midpoint(
            keypoints_by_name["left_shoulder"], keypoints_by_name["right_shoulder"]
        )
        hip_midpoint = _midpoint(keypoints_by_name["left_hip"], keypoints_by_name["right_hip"])
        samples.append(_angle_from_vertical(hip_midpoint, shoulder_midpoint))

    return samples


def _invalid_repetition_reasons(phase_summary: PhaseSummary) -> set[str]:
    reasons: set[str] = set()
    for repetition in phase_summary.invalid_repetition_details:
        for reason in repetition.get("reasons") or []:
            reasons.add(str(reason))
    return reasons


def _pose_error(
    *,
    code: str,
    label: str,
    severity: str,
    feedback: str,
    evidence: Dict[str, Any],
) -> PoseError:
    return {
        "code": code,
        "label": label,
        "severity": severity,
        "feedback": feedback,
        "evidence": evidence,
    }


def _severity(value: float, *, minor_threshold: float, major_threshold: float) -> str:
    if value >= major_threshold:
        return "major"
    if value >= minor_threshold:
        return "minor"
    return "none"


def _horizontal_distance(first: Dict[str, Any], second: Dict[str, Any]) -> float:
    return abs(float(first["x"]) - float(second["x"]))


def _midpoint(first: Dict[str, Any], second: Dict[str, Any]) -> Dict[str, float]:
    return {
        "x": (float(first["x"]) + float(second["x"])) / 2,
        "y": (float(first["y"]) + float(second["y"])) / 2,
    }


def _angle_from_vertical(start: Dict[str, float], end: Dict[str, float]) -> float:
    dx = abs(float(end["x"]) - float(start["x"]))
    dy = abs(float(end["y"]) - float(start["y"]))
    if dx == 0 and dy == 0:
        return 0.0
    return math.degrees(math.atan2(dx, dy))
