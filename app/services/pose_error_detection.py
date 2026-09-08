from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Sequence

from app.services.exercise_rules import AngleSample, ExerciseRule, PhaseSummary
from app.services.pose_features import (
    JointTriplet,
    calculate_joint_angle,
    extract_body_line_offset_samples,
    extract_body_line_samples,
    extract_symmetry_samples,
    index_keypoints,
    keypoints_have_confidence,
)

# 身体直线偏差沿用历史判据（18/30 度），方向只用于区分塌腰与撅臀两个 code。
BODY_LINE_DEVIATION_THRESHOLD = 18.0
BODY_LINE_DEVIATION_MAJOR_THRESHOLD = 30.0
BODY_TWIST_DEVIATION_THRESHOLD = 12.0
BODY_TWIST_DEVIATION_MAJOR_THRESHOLD = 20.0
RHYTHM_CV_THRESHOLD = 0.45
RHYTHM_CV_MAJOR_THRESHOLD = 0.70
RHYTHM_MIN_REPS = 3

PoseError = Dict[str, Any]
ErrorDetector = Callable[
    [Sequence[Dict[str, Any]], PhaseSummary, ExerciseRule], Optional[PoseError]
]


@dataclass(frozen=True)
class ErrorRuleDefinition:
    """Discoverable metadata for one deterministic movement-error rule."""

    exercise_type: str
    code: str
    label: str
    detector: ErrorDetector


def detect_pose_errors(
    frames: Sequence[Dict[str, Any]],
    angle_samples: Sequence[AngleSample],
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> List[PoseError]:
    """Return rule-specific movement errors with stable codes and evidence."""
    del angle_samples

    errors: List[PoseError] = []
    for error_rule in get_error_rule_definitions(rule.exercise_type):
        detected = error_rule.detector(frames, phase_summary, rule)
        if detected:
            errors.append(detected)
    return errors


def get_error_rule_definitions(exercise_type: str) -> List[ErrorRuleDefinition]:
    """Return registered movement-error rules for an exercise key."""
    return list(ERROR_RULES_BY_EXERCISE.get(exercise_type, ()))


def get_registered_error_codes(exercise_type: str) -> List[str]:
    """Return stable movement-error codes registered for an exercise key."""
    return [error_rule.code for error_rule in get_error_rule_definitions(exercise_type)]


def _detect_pushup_insufficient_range(
    frames: Sequence[Dict[str, Any]],
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> Optional[PoseError]:
    del frames
    return _build_insufficient_range_error(
        code="push_up_insufficient_range",
        label="俯卧撑幅度不足",
        feedback="俯卧撑幅度不足，建议下放到更低位置并完成顶部伸展",
        phase_summary=phase_summary,
        rule=rule,
    )


def _detect_squat_insufficient_depth(
    frames: Sequence[Dict[str, Any]],
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> Optional[PoseError]:
    del frames
    return _build_insufficient_range_error(
        code="squat_insufficient_depth",
        label="深蹲蹲深不足",
        feedback="深蹲蹲深不足，建议继续下蹲到目标膝关节角度",
        phase_summary=phase_summary,
        rule=rule,
    )


def _detect_pushup_body_line(
    frames: Sequence[Dict[str, Any]],
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> Optional[PoseError]:
    del phase_summary
    return _build_pushup_body_line_error(frames, rule, expect_sagging=True)


def _detect_pushup_hip_pike(
    frames: Sequence[Dict[str, Any]],
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> Optional[PoseError]:
    del phase_summary
    return _build_pushup_body_line_error(frames, rule, expect_sagging=False)


def _detect_pushup_body_twist(
    frames: Sequence[Dict[str, Any]],
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> Optional[PoseError]:
    del phase_summary
    return _build_pushup_body_twist_error(frames, rule)


def _detect_pushup_rhythm_instability(
    frames: Sequence[Dict[str, Any]],
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> Optional[PoseError]:
    del frames
    del rule
    return _build_pushup_rhythm_instability_error(phase_summary)


def _detect_pushup_elbow_flare(
    frames: Sequence[Dict[str, Any]],
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> Optional[PoseError]:
    del phase_summary
    return _build_pushup_elbow_flare_error(frames, rule)


def _detect_squat_knee_valgus(
    frames: Sequence[Dict[str, Any]],
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> Optional[PoseError]:
    del phase_summary
    return _build_squat_knee_valgus_error(frames, rule)


def _detect_squat_forward_lean(
    frames: Sequence[Dict[str, Any]],
    phase_summary: PhaseSummary,
    rule: ExerciseRule,
) -> Optional[PoseError]:
    del phase_summary
    return _build_squat_forward_lean_error(frames, rule)


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


def _body_line_stats(
    frames: Sequence[Dict[str, Any]], rule: ExerciseRule
) -> Optional[Dict[str, Any]]:
    """肩-髋-踝链的幅度与方向证据。"""
    samples = extract_body_line_samples(frames, min_confidence=rule.min_confidence)
    if not samples:
        return None

    offsets = extract_body_line_offset_samples(frames, min_confidence=rule.min_confidence)
    return {
        "sample_count": len(samples),
        "average_deviation": sum(sample.deviation for sample in samples) / len(samples),
        "max_deviation": max(sample.deviation for sample in samples),
        "mean_hip_offset_ratio": (
            sum(sample.offset_ratio for sample in offsets) / len(offsets)
            if offsets
            else None
        ),
        "offset_sample_count": len(offsets),
    }


def _build_pushup_body_line_error(
    frames: Sequence[Dict[str, Any]], rule: ExerciseRule, *, expect_sagging: bool
) -> Optional[PoseError]:
    """按髋点落在体轴哪一侧，输出塌腰或撅臀中的一个 code。

    两者偏差幅度阈值相同，但纠正建议相反，因此不能再用一个 code 混报两类错误。
    没有方向信息（体轴不接近水平）时归入塌腰，保证身体直线证据不丢，
    同时用 hip_offset_direction=not_applicable 明示这是退化路径。
    """
    stats = _body_line_stats(frames, rule)
    if not stats or stats["average_deviation"] <= BODY_LINE_DEVIATION_THRESHOLD:
        return None

    offset_ratio = stats["mean_hip_offset_ratio"]
    sagging = True if offset_ratio is None else offset_ratio >= 0
    if sagging != expect_sagging:
        return None

    evidence: Dict[str, Any] = {
        "sample_count": stats["sample_count"],
        "average_body_line_deviation": round(stats["average_deviation"], 2),
        "max_body_line_deviation": round(stats["max_deviation"], 2),
    }
    severity = _severity(
        stats["average_deviation"],
        minor_threshold=BODY_LINE_DEVIATION_THRESHOLD,
        major_threshold=BODY_LINE_DEVIATION_MAJOR_THRESHOLD,
    )

    if not expect_sagging:
        evidence["mean_hip_offset_ratio"] = round(offset_ratio, 4)
        evidence["direction"] = "hip_above_line"
        return _pose_error(
            code="push_up_hip_pike",
            label="俯卧撑撅臀",
            severity=severity,
            feedback="俯卧撑撅臀，髋部高于肩踝连线，建议下放髋部回到身体直线，不要用臀部先顶起来",
            evidence=evidence,
        )

    if offset_ratio is None:
        # 体轴不接近水平（站立、侧翻或机位不合规）时不给方向结论，只报“未保持平直”。
        evidence["hip_offset_direction"] = "not_applicable"
    else:
        evidence["mean_hip_offset_ratio"] = round(offset_ratio, 4)
    return _pose_error(
        code="push_up_sagging_waist",
        label="俯卧撑塌腰",
        severity=severity,
        feedback="俯卧撑塌腰，髋部下坠到肩踝连线下方，建议收紧核心与臀部，保持肩髋踝一条直线",
        evidence=evidence,
    )


def _build_pushup_body_twist_error(
    frames: Sequence[Dict[str, Any]], rule: ExerciseRule
) -> Optional[PoseError]:
    """左右身体链角度差过大，对应“身体未保持平直”中的躯干扭转。"""
    samples = extract_symmetry_samples(
        frames,
        JointTriplet("left_shoulder", "left_hip", "left_ankle"),
        JointTriplet("right_shoulder", "right_hip", "right_ankle"),
        min_confidence=rule.min_confidence,
    )
    if not samples:
        return None

    average_difference = sum(sample.difference for sample in samples) / len(samples)
    if average_difference <= BODY_TWIST_DEVIATION_THRESHOLD:
        return None

    return _pose_error(
        code="push_up_body_twist",
        label="俯卧撑身体扭转",
        severity=_severity(
            average_difference,
            minor_threshold=BODY_TWIST_DEVIATION_THRESHOLD,
            major_threshold=BODY_TWIST_DEVIATION_MAJOR_THRESHOLD,
        ),
        feedback="俯卧撑左右身体不对称，躯干发生扭转，建议双肩等高、双手等宽，整体上下",
        evidence={
            "sample_count": len(samples),
            "average_left_right_difference": round(average_difference, 2),
            "max_left_right_difference": round(
                max(sample.difference for sample in samples), 2
            ),
        },
    )


def _build_pushup_rhythm_instability_error(
    phase_summary: PhaseSummary,
) -> Optional[PoseError]:
    """有效次数时长离散过大：工程判据，用于提示代偿与力竭，不是国标内容。"""
    durations = [
        int(repetition["duration_ms"])
        for repetition in (phase_summary.repetition_details or [])
        if repetition.get("duration_ms") is not None
    ]
    if len(durations) < RHYTHM_MIN_REPS:
        return None

    average_duration = sum(durations) / len(durations)
    if average_duration <= 0:
        return None

    coefficient_of_variation = statistics.pstdev(durations) / average_duration
    if coefficient_of_variation <= RHYTHM_CV_THRESHOLD:
        return None

    return _pose_error(
        code="push_up_rhythm_instability",
        label="俯卧撑节奏不稳定",
        severity=_severity(
            coefficient_of_variation,
            minor_threshold=RHYTHM_CV_THRESHOLD,
            major_threshold=RHYTHM_CV_MAJOR_THRESHOLD,
        ),
        feedback="俯卧撑各次之间快慢差异过大，建议保持匀速下放与撑起，减少靠惯性补的次数",
        evidence={
            "rep_count": len(durations),
            "average_rep_duration_ms": round(average_duration, 1),
            "duration_coefficient_of_variation": round(coefficient_of_variation, 3),
            "min_rep_duration_ms": min(durations),
            "max_rep_duration_ms": max(durations),
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


ERROR_RULE_DEFINITIONS: Sequence[ErrorRuleDefinition] = (
    ErrorRuleDefinition(
        exercise_type="push_up",
        code="push_up_insufficient_range",
        label="俯卧撑幅度不足",
        detector=_detect_pushup_insufficient_range,
    ),
    ErrorRuleDefinition(
        exercise_type="push_up",
        code="push_up_sagging_waist",
        label="俯卧撑塌腰",
        detector=_detect_pushup_body_line,
    ),
    ErrorRuleDefinition(
        exercise_type="push_up",
        code="push_up_hip_pike",
        label="俯卧撑撅臀",
        detector=_detect_pushup_hip_pike,
    ),
    ErrorRuleDefinition(
        exercise_type="push_up",
        code="push_up_elbow_flare",
        label="俯卧撑手肘外展过大",
        detector=_detect_pushup_elbow_flare,
    ),
    ErrorRuleDefinition(
        exercise_type="push_up",
        code="push_up_body_twist",
        label="俯卧撑身体扭转",
        detector=_detect_pushup_body_twist,
    ),
    ErrorRuleDefinition(
        exercise_type="push_up",
        code="push_up_rhythm_instability",
        label="俯卧撑节奏不稳定",
        detector=_detect_pushup_rhythm_instability,
    ),
    ErrorRuleDefinition(
        exercise_type="squat",
        code="squat_insufficient_depth",
        label="深蹲蹲深不足",
        detector=_detect_squat_insufficient_depth,
    ),
    ErrorRuleDefinition(
        exercise_type="squat",
        code="squat_knee_valgus",
        label="深蹲膝盖内扣",
        detector=_detect_squat_knee_valgus,
    ),
    ErrorRuleDefinition(
        exercise_type="squat",
        code="squat_forward_lean",
        label="深蹲身体前倾过大",
        detector=_detect_squat_forward_lean,
    ),
)

ERROR_RULES_BY_EXERCISE: Dict[str, Sequence[ErrorRuleDefinition]] = {}
for definition in ERROR_RULE_DEFINITIONS:
    ERROR_RULES_BY_EXERCISE.setdefault(definition.exercise_type, tuple())
    ERROR_RULES_BY_EXERCISE[definition.exercise_type] = (
        *ERROR_RULES_BY_EXERCISE[definition.exercise_type],
        definition,
    )
