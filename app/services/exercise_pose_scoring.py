from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence

from app.models.exercise import Exercise, ExerciseRecord
from app.services.pushup_phase_detection import detect_pushup_phases
from app.services.video_pose_analysis import POSE_ANALYSIS_SCHEMA_VERSION


class PoseScoringError(Exception):
    """Base error for pose scoring failures."""


class PoseScoringUnavailableError(PoseScoringError):
    """Raised when pose data cannot support deterministic scoring."""


@dataclass(frozen=True)
class JointTriplet:
    start: str
    middle: str
    end: str


@dataclass(frozen=True)
class ScoringRule:
    exercise_type: str
    aliases: Sequence[str]
    required_keypoints: Sequence[str]
    joint_triplets: Sequence[JointTriplet]
    min_confidence: float
    min_valid_frames: int
    down_angle: float
    up_angle: float
    target_angle: float
    min_range: float
    # Configurable deduction rates (per-degree / per-unit penalty)
    depth_penalty_rate: float = 0.9
    extension_penalty_rate: float = 0.6
    range_penalty_rate: float = 0.8
    no_repetition_penalty: float = 15.0
    low_confidence_penalty: float = 10.0
    low_confidence_threshold: float = 0.55
    min_rep_duration_ms: int = 250
    max_rep_duration_ms: int = 8000


@dataclass(frozen=True)
class AngleSample:
    frame_index: int
    timestamp_ms: int
    angle: float
    confidence: float


@dataclass(frozen=True)
class PhaseSummary:
    repetitions: int
    phases: List[Dict[str, Any]]
    min_angle: float
    max_angle: float
    angle_range: float
    average_confidence: float
    repetition_details: List[Dict[str, Any]] = field(default_factory=list)
    invalid_repetition_details: List[Dict[str, Any]] = field(default_factory=list)
    count_source: str = "angle_threshold"


DEFAULT_RULES = [
    ScoringRule(
        exercise_type="squat",
        aliases=("深蹲", "标准深蹲", "squat"),
        required_keypoints=(
            "left_hip",
            "left_knee",
            "left_ankle",
            "right_hip",
            "right_knee",
            "right_ankle",
        ),
        joint_triplets=(
            JointTriplet("left_hip", "left_knee", "left_ankle"),
            JointTriplet("right_hip", "right_knee", "right_ankle"),
        ),
        min_confidence=0.35,
        min_valid_frames=3,
        down_angle=115,
        up_angle=155,
        target_angle=105,
        min_range=40,
    ),
    ScoringRule(
        exercise_type="push_up",
        aliases=("俯卧撑", "标准俯卧撑", "pushup", "push-up", "push up"),
        required_keypoints=(
            "left_shoulder",
            "left_elbow",
            "left_wrist",
            "right_shoulder",
            "right_elbow",
            "right_wrist",
        ),
        joint_triplets=(
            JointTriplet("left_shoulder", "left_elbow", "left_wrist"),
            JointTriplet("right_shoulder", "right_elbow", "right_wrist"),
        ),
        min_confidence=0.35,
        min_valid_frames=3,
        down_angle=95,
        up_angle=150,
        target_angle=90,
        min_range=45,
    ),
]


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
    exercise_name = (exercise.name or "").strip().lower()
    for rule in DEFAULT_RULES:
        if any(exercise_name == alias.lower() for alias in rule.aliases):
            return _rule_with_standard_overrides(rule, exercise.standard)
    return None


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


def keypoints_have_confidence(
    keypoints_by_name: Dict[str, Dict[str, Any]],
    required_keypoints: Iterable[str],
    min_confidence: float,
) -> bool:
    return all(
        keypoint_name in keypoints_by_name
        and float(keypoints_by_name[keypoint_name].get("score", 0)) >= min_confidence
        for keypoint_name in required_keypoints
    )


def extract_angle_samples(
    frames: Sequence[Dict[str, Any]], rule: ScoringRule
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
    if not angle_samples:
        raise PoseScoringUnavailableError("没有可用的关节角序列")

    phases: List[Dict[str, Any]] = []
    last_phase: Optional[str] = None
    saw_down = False
    repetitions = 0

    for sample in angle_samples:
        if sample.angle <= down_angle:
            current_phase = "down"
        elif sample.angle >= up_angle:
            current_phase = "up"
        else:
            current_phase = "transition"

        if current_phase == "down":
            saw_down = True
        if current_phase == "up" and last_phase == "down" and saw_down:
            repetitions += 1
            saw_down = False

        if current_phase != last_phase:
            phases.append(
                {
                    "phase": current_phase,
                    "frame_index": sample.frame_index,
                    "timestamp_ms": sample.timestamp_ms,
                    "angle": round(sample.angle, 2),
                }
            )
            last_phase = current_phase

    angles = [sample.angle for sample in angle_samples]
    confidences = [sample.confidence for sample in angle_samples]
    min_angle = min(angles)
    max_angle = max(angles)
    return PhaseSummary(
        repetitions=repetitions,
        phases=phases,
        min_angle=min_angle,
        max_angle=max_angle,
        angle_range=max_angle - min_angle,
        average_confidence=sum(confidences) / len(confidences),
        repetition_details=[],
        invalid_repetition_details=[],
        count_source="angle_threshold",
    )


def extract_phase_summary(
    angle_samples: Sequence[AngleSample], rule: ScoringRule
) -> PhaseSummary:
    if rule.exercise_type != "push_up":
        return extract_movement_phases(
            angle_samples,
            down_angle=rule.down_angle,
            up_angle=rule.up_angle,
        )

    try:
        pushup_summary = detect_pushup_phases(
            angle_samples,
            down_angle=rule.down_angle,
            up_angle=rule.up_angle,
        )
    except ValueError as exc:
        raise PoseScoringUnavailableError("没有可用的关节角序列") from exc

    return PhaseSummary(
        repetitions=pushup_summary.repetitions,
        phases=pushup_summary.phases,
        min_angle=pushup_summary.min_angle,
        max_angle=pushup_summary.max_angle,
        angle_range=pushup_summary.angle_range,
        average_confidence=pushup_summary.average_confidence,
        repetition_details=pushup_summary.repetition_details,
        invalid_repetition_details=pushup_summary.invalid_repetition_details,
        count_source=pushup_summary.count_source,
    )


def score_phase_summary(
    phase_summary: PhaseSummary, rule: ScoringRule
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


def _rule_with_standard_overrides(
    rule: ScoringRule, standard: Optional[Dict[str, Any]]
) -> ScoringRule:
    pose_standard = (standard or {}).get("pose_scoring") or {}
    if not isinstance(pose_standard, dict):
        return rule

    return ScoringRule(
        exercise_type=rule.exercise_type,
        aliases=rule.aliases,
        required_keypoints=tuple(
            pose_standard.get("required_keypoints") or rule.required_keypoints
        ),
        joint_triplets=rule.joint_triplets,
        min_confidence=float(pose_standard.get("min_confidence", rule.min_confidence)),
        min_valid_frames=int(
            pose_standard.get("min_valid_frames", rule.min_valid_frames)
        ),
        down_angle=float(pose_standard.get("down_angle", rule.down_angle)),
        up_angle=float(pose_standard.get("up_angle", rule.up_angle)),
        target_angle=float(pose_standard.get("target_angle", rule.target_angle)),
        min_range=float(pose_standard.get("min_range", rule.min_range)),
        depth_penalty_rate=float(
            pose_standard.get("depth_penalty_rate", rule.depth_penalty_rate)
        ),
        extension_penalty_rate=float(
            pose_standard.get("extension_penalty_rate", rule.extension_penalty_rate)
        ),
        range_penalty_rate=float(
            pose_standard.get("range_penalty_rate", rule.range_penalty_rate)
        ),
        no_repetition_penalty=float(
            pose_standard.get("no_repetition_penalty", rule.no_repetition_penalty)
        ),
        low_confidence_penalty=float(
            pose_standard.get("low_confidence_penalty", rule.low_confidence_penalty)
        ),
        low_confidence_threshold=float(
            pose_standard.get("low_confidence_threshold", rule.low_confidence_threshold)
        ),
        min_rep_duration_ms=int(
            pose_standard.get("min_rep_duration_ms", rule.min_rep_duration_ms)
        ),
        max_rep_duration_ms=int(
            pose_standard.get("max_rep_duration_ms", rule.max_rep_duration_ms)
        ),
    )
