from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol, Sequence


class AngleLike(Protocol):
    frame_index: int
    timestamp_ms: int
    angle: float
    confidence: float


@dataclass(frozen=True)
class PushupPhaseDetectionResult:
    repetitions: int
    phases: List[Dict[str, Any]]
    min_angle: float
    max_angle: float
    angle_range: float
    average_confidence: float
    repetition_details: List[Dict[str, Any]] = field(default_factory=list)
    invalid_repetition_details: List[Dict[str, Any]] = field(default_factory=list)
    count_source: str = "angle_peak_valley"


def detect_pushup_phases(
    angle_samples: Sequence[AngleLike],
    *,
    down_angle: float,
    up_angle: float,
    movement_epsilon: float = 2.0,
    hysteresis: float = 6.0,
    min_angle_range: float = 45.0,
    min_duration_ms: int = 250,
    max_duration_ms: int = 8000,
    min_average_confidence: float = 0.55,
) -> PushupPhaseDetectionResult:
    if not angle_samples:
        raise ValueError("angle_samples must not be empty")

    smoothed_samples = _angle_sample_dicts(angle_samples)
    repetition_details, invalid_repetition_details = _detect_peak_valley_repetitions(
        smoothed_samples,
        down_angle=down_angle,
        up_angle=up_angle,
        min_angle_range=min_angle_range,
        min_duration_ms=min_duration_ms,
        max_duration_ms=max_duration_ms,
        min_average_confidence=min_average_confidence,
    )

    phases: List[Dict[str, Any]] = []
    state = "ready" if float(angle_samples[0].angle) >= up_angle else "transition"
    start_sample: Optional[AngleLike] = angle_samples[0] if state == "ready" else None
    bottom_sample: Optional[AngleLike] = None
    previous_sample: Optional[AngleLike] = angle_samples[0]

    _append_phase(phases, state, angle_samples[0])

    for sample in angle_samples[1:]:
        angle = float(sample.angle)
        previous_angle = float(previous_sample.angle) if previous_sample else None

        if state in ("ready", "complete", "transition"):
            if angle <= down_angle:
                if start_sample is None:
                    start_sample = previous_sample or sample
                state = _enter_phase(phases, "down", sample, state)
                state = _enter_phase(phases, "bottom", sample, state)
                bottom_sample = sample
            elif _is_descending(angle, previous_angle, movement_epsilon) or angle < (
                up_angle - hysteresis
            ):
                if start_sample is None:
                    start_sample = previous_sample or sample
                state = _enter_phase(phases, "down", sample, state)

        elif state == "down":
            if angle <= down_angle:
                state = _enter_phase(phases, "bottom", sample, state)
                bottom_sample = sample
            elif angle >= up_angle:
                start_sample = sample
                state = _enter_phase(phases, "ready", sample, state)

        elif state == "bottom":
            if angle >= up_angle:
                state = _enter_phase(phases, "up", sample, state)
                state = _enter_phase(phases, "complete", sample, state)
                start_sample = sample
                bottom_sample = None
            elif _is_ascending(angle, previous_angle, movement_epsilon) or angle >= (
                down_angle + hysteresis
            ):
                state = _enter_phase(phases, "up", sample, state)

        elif state == "up":
            if angle >= up_angle:
                state = _enter_phase(phases, "complete", sample, state)
                start_sample = sample
                bottom_sample = None
            elif angle <= down_angle:
                state = _enter_phase(phases, "bottom", sample, state)
                bottom_sample = sample

        previous_sample = sample

    angles = [float(sample.angle) for sample in angle_samples]
    confidences = [float(sample.confidence) for sample in angle_samples]
    min_angle = min(angles)
    max_angle = max(angles)
    return PushupPhaseDetectionResult(
        repetitions=len(repetition_details),
        phases=phases,
        min_angle=min_angle,
        max_angle=max_angle,
        angle_range=max_angle - min_angle,
        average_confidence=sum(confidences) / len(confidences),
        repetition_details=repetition_details,
        invalid_repetition_details=invalid_repetition_details,
    )


def _is_descending(
    angle: float, previous_angle: Optional[float], movement_epsilon: float
) -> bool:
    return previous_angle is not None and previous_angle - angle >= movement_epsilon


def _is_ascending(
    angle: float, previous_angle: Optional[float], movement_epsilon: float
) -> bool:
    return previous_angle is not None and angle - previous_angle >= movement_epsilon


def _enter_phase(
    phases: List[Dict[str, Any]], phase: str, sample: AngleLike, current_state: str
) -> str:
    if phase != current_state:
        _append_phase(phases, phase, sample)
    return phase


def _append_phase(
    phases: List[Dict[str, Any]], phase: str, sample: AngleLike
) -> None:
    phases.append(
        {
            "phase": phase,
            "frame_index": int(sample.frame_index),
            "timestamp_ms": int(sample.timestamp_ms),
            "angle": round(float(sample.angle), 2),
        }
    )


def _build_repetition_detail(
    index: int,
    start_sample: AngleLike,
    bottom_sample: AngleLike,
    complete_sample: AngleLike,
) -> Dict[str, Any]:
    return {
        "index": index,
        "start_frame_index": int(start_sample.frame_index),
        "bottom_frame_index": int(bottom_sample.frame_index),
        "complete_frame_index": int(complete_sample.frame_index),
        "start_timestamp_ms": int(start_sample.timestamp_ms),
        "bottom_timestamp_ms": int(bottom_sample.timestamp_ms),
        "complete_timestamp_ms": int(complete_sample.timestamp_ms),
        "start_angle": round(float(start_sample.angle), 2),
        "bottom_angle": round(float(bottom_sample.angle), 2),
        "complete_angle": round(float(complete_sample.angle), 2),
        "duration_ms": int(complete_sample.timestamp_ms)
        - int(start_sample.timestamp_ms),
    }


def _angle_sample_dicts(angle_samples: Sequence[AngleLike]) -> List[Dict[str, Any]]:
    """Normalize angle samples for peak-valley counting without losing extrema."""
    normalized: List[Dict[str, Any]] = []
    for sample in angle_samples:
        normalized.append(
            {
                "source": sample,
                "frame_index": int(sample.frame_index),
                "timestamp_ms": int(sample.timestamp_ms),
                "angle": float(sample.angle),
                "raw_angle": float(sample.angle),
                "confidence": float(sample.confidence),
            }
        )
    return normalized


def _detect_peak_valley_repetitions(
    samples: Sequence[Dict[str, Any]],
    *,
    down_angle: float,
    up_angle: float,
    min_angle_range: float,
    min_duration_ms: int,
    max_duration_ms: int,
    min_average_confidence: float,
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    valid_reps: List[Dict[str, Any]] = []
    invalid_reps: List[Dict[str, Any]] = []
    start_peak: Optional[Dict[str, Any]] = None
    valley: Optional[Dict[str, Any]] = None

    for sample in samples:
        angle = float(sample["angle"])
        if start_peak is None:
            if angle >= up_angle:
                start_peak = sample
            continue

        if valley is None:
            if angle < float(start_peak["angle"]):
                valley = sample if valley is None else _lower_angle_sample(valley, sample)
            if angle >= up_angle and sample is not start_peak:
                start_peak = _higher_angle_sample(start_peak, sample)
            continue

        if angle < float(valley["angle"]):
            valley = sample

        if angle >= up_angle:
            candidate = _build_peak_valley_candidate(
                len(valid_reps) + len(invalid_reps) + 1,
                start_peak,
                valley,
                sample,
            )
            reasons = _validate_repetition_candidate(
                candidate,
                down_angle=down_angle,
                up_angle=up_angle,
                min_angle_range=min_angle_range,
                min_duration_ms=min_duration_ms,
                max_duration_ms=max_duration_ms,
                min_average_confidence=min_average_confidence,
            )
            if reasons:
                candidate["valid"] = False
                candidate["reasons"] = reasons
                invalid_reps.append(candidate)
            else:
                candidate["index"] = len(valid_reps) + 1
                candidate["valid"] = True
                valid_reps.append(candidate)

            start_peak = sample
            valley = None

    if start_peak is not None and valley is not None:
        invalid_reps.append(
            {
                "index": len(valid_reps) + len(invalid_reps) + 1,
                "valid": False,
                "start_frame_index": int(start_peak["frame_index"]),
                "bottom_frame_index": int(valley["frame_index"]),
                "complete_frame_index": None,
                "start_timestamp_ms": int(start_peak["timestamp_ms"]),
                "bottom_timestamp_ms": int(valley["timestamp_ms"]),
                "complete_timestamp_ms": None,
                "start_angle": round(float(start_peak["angle"]), 2),
                "bottom_angle": round(float(valley["angle"]), 2),
                "complete_angle": None,
                "angle_range": round(float(start_peak["angle"]) - float(valley["angle"]), 2),
                "duration_ms": None,
                "average_confidence": round(
                    (float(start_peak["confidence"]) + float(valley["confidence"])) / 2,
                    4,
                ),
                "reasons": ["incomplete_extension"],
            }
        )

    return valid_reps, invalid_reps


def _build_peak_valley_candidate(
    index: int,
    start_sample: Dict[str, Any],
    bottom_sample: Dict[str, Any],
    complete_sample: Dict[str, Any],
) -> Dict[str, Any]:
    average_confidence = (
        float(start_sample["confidence"])
        + float(bottom_sample["confidence"])
        + float(complete_sample["confidence"])
    ) / 3
    angle_range = max(float(start_sample["angle"]), float(complete_sample["angle"])) - float(
        bottom_sample["angle"]
    )
    return {
        "index": index,
        "start_frame_index": int(start_sample["frame_index"]),
        "bottom_frame_index": int(bottom_sample["frame_index"]),
        "complete_frame_index": int(complete_sample["frame_index"]),
        "start_timestamp_ms": int(start_sample["timestamp_ms"]),
        "bottom_timestamp_ms": int(bottom_sample["timestamp_ms"]),
        "complete_timestamp_ms": int(complete_sample["timestamp_ms"]),
        "start_angle": round(float(start_sample["angle"]), 2),
        "bottom_angle": round(float(bottom_sample["angle"]), 2),
        "complete_angle": round(float(complete_sample["angle"]), 2),
        "angle_range": round(angle_range, 2),
        "duration_ms": int(complete_sample["timestamp_ms"])
        - int(start_sample["timestamp_ms"]),
        "average_confidence": round(average_confidence, 4),
    }


def _validate_repetition_candidate(
    candidate: Dict[str, Any],
    *,
    down_angle: float,
    up_angle: float,
    min_angle_range: float,
    min_duration_ms: int,
    max_duration_ms: int,
    min_average_confidence: float,
) -> List[str]:
    reasons: List[str] = []
    if float(candidate["bottom_angle"]) > down_angle:
        reasons.append("insufficient_depth")
    if float(candidate["start_angle"]) < up_angle or float(candidate["complete_angle"]) < up_angle:
        reasons.append("incomplete_extension")
    if float(candidate["angle_range"]) < min_angle_range:
        reasons.append("insufficient_range")
    if int(candidate["duration_ms"]) < min_duration_ms:
        reasons.append("too_fast")
    if int(candidate["duration_ms"]) > max_duration_ms:
        reasons.append("too_slow")
    if float(candidate["average_confidence"]) < min_average_confidence:
        reasons.append("low_confidence")
    return reasons


def _higher_angle_sample(
    first: Dict[str, Any], second: Dict[str, Any]
) -> Dict[str, Any]:
    return first if float(first["angle"]) >= float(second["angle"]) else second


def _lower_angle_sample(
    first: Dict[str, Any], second: Dict[str, Any]
) -> Dict[str, Any]:
    return first if float(first["angle"]) <= float(second["angle"]) else second
