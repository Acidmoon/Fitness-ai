from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any, Dict, Iterable, List, Optional, Sequence


class PoseScoringUnavailableError(Exception):
    """Raised when pose data cannot support deterministic scoring."""


@dataclass(frozen=True)
class JointTriplet:
    start: str
    middle: str
    end: str


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


@dataclass(frozen=True)
class ExerciseRule:
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
    depth_penalty_rate: float = 0.9
    extension_penalty_rate: float = 0.6
    range_penalty_rate: float = 0.8
    no_repetition_penalty: float = 15.0
    low_confidence_penalty: float = 10.0
    low_confidence_threshold: float = 0.55
    min_rep_duration_ms: int = 250
    max_rep_duration_ms: int = 8000

    def with_standard_overrides(
        self, standard: Optional[Dict[str, Any]]
    ) -> "ExerciseRule":
        pose_standard = (standard or {}).get("pose_scoring") or {}
        if not isinstance(pose_standard, dict):
            return self

        return replace(
            self,
            required_keypoints=tuple(
                pose_standard.get("required_keypoints") or self.required_keypoints
            ),
            min_confidence=float(
                pose_standard.get("min_confidence", self.min_confidence)
            ),
            min_valid_frames=int(
                pose_standard.get("min_valid_frames", self.min_valid_frames)
            ),
            down_angle=float(pose_standard.get("down_angle", self.down_angle)),
            up_angle=float(pose_standard.get("up_angle", self.up_angle)),
            target_angle=float(pose_standard.get("target_angle", self.target_angle)),
            min_range=float(pose_standard.get("min_range", self.min_range)),
            depth_penalty_rate=float(
                pose_standard.get("depth_penalty_rate", self.depth_penalty_rate)
            ),
            extension_penalty_rate=float(
                pose_standard.get(
                    "extension_penalty_rate", self.extension_penalty_rate
                )
            ),
            range_penalty_rate=float(
                pose_standard.get("range_penalty_rate", self.range_penalty_rate)
            ),
            no_repetition_penalty=float(
                pose_standard.get(
                    "no_repetition_penalty", self.no_repetition_penalty
                )
            ),
            low_confidence_penalty=float(
                pose_standard.get(
                    "low_confidence_penalty", self.low_confidence_penalty
                )
            ),
            low_confidence_threshold=float(
                pose_standard.get(
                    "low_confidence_threshold", self.low_confidence_threshold
                )
            ),
            min_rep_duration_ms=int(
                pose_standard.get("min_rep_duration_ms", self.min_rep_duration_ms)
            ),
            max_rep_duration_ms=int(
                pose_standard.get("max_rep_duration_ms", self.max_rep_duration_ms)
            ),
        )

    def summarize_phases(self, angle_samples: Sequence[AngleSample]) -> PhaseSummary:
        return extract_threshold_phases(
            angle_samples,
            down_angle=self.down_angle,
            up_angle=self.up_angle,
        )


def extract_threshold_phases(
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
