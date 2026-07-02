from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Protocol, Sequence


class AngleLike(Protocol):
    frame_index: int
    timestamp_ms: int
    angle: float
    confidence: float


@dataclass(frozen=True)
class PeakValleyCounterConfig:
    down_angle: float
    up_angle: float
    min_angle_range: float
    min_duration_ms: int = 250
    max_duration_ms: int = 8000
    min_average_confidence: float = 0.55
    count_source: str = "angle_peak_valley"


@dataclass(frozen=True)
class PeakValleyCountResult:
    valid_reps: List[Dict[str, Any]]
    invalid_reps: List[Dict[str, Any]]
    count_source: str = "angle_peak_valley"


def count_peak_valley_repetitions(
    angle_samples: Sequence[AngleLike],
    config: PeakValleyCounterConfig,
) -> PeakValleyCountResult:
    """Count complete peak-valley-peak cycles from a joint-angle trajectory."""
    samples = _angle_sample_dicts(angle_samples)
    valid_reps, invalid_reps = _detect_peak_valley_repetitions(
        samples,
        down_angle=config.down_angle,
        up_angle=config.up_angle,
        min_angle_range=config.min_angle_range,
        min_duration_ms=config.min_duration_ms,
        max_duration_ms=config.max_duration_ms,
        min_average_confidence=config.min_average_confidence,
    )
    return PeakValleyCountResult(
        valid_reps=valid_reps,
        invalid_reps=invalid_reps,
        count_source=config.count_source,
    )


def _angle_sample_dicts(angle_samples: Sequence[AngleLike]) -> List[Dict[str, Any]]:
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
                "angle_range": round(
                    float(start_peak["angle"]) - float(valley["angle"]), 2
                ),
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
