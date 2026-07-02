from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol, Sequence

from app.services.exercise_rules.repetition_counter import (
    PeakValleyCounterConfig,
    count_peak_valley_repetitions,
)


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

    count_result = count_peak_valley_repetitions(
        angle_samples,
        PeakValleyCounterConfig(
            down_angle=down_angle,
            up_angle=up_angle,
            min_angle_range=min_angle_range,
            min_duration_ms=min_duration_ms,
            max_duration_ms=max_duration_ms,
            min_average_confidence=min_average_confidence,
        ),
    )

    phases: List[Dict[str, Any]] = []
    state = "ready" if float(angle_samples[0].angle) >= up_angle else "transition"
    start_sample: Optional[AngleLike] = angle_samples[0] if state == "ready" else None
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
            elif _is_descending(angle, previous_angle, movement_epsilon) or angle < (
                up_angle - hysteresis
            ):
                if start_sample is None:
                    start_sample = previous_sample or sample
                state = _enter_phase(phases, "down", sample, state)

        elif state == "down":
            if angle <= down_angle:
                state = _enter_phase(phases, "bottom", sample, state)
            elif angle >= up_angle:
                start_sample = sample
                state = _enter_phase(phases, "ready", sample, state)

        elif state == "bottom":
            if angle >= up_angle:
                state = _enter_phase(phases, "up", sample, state)
                state = _enter_phase(phases, "complete", sample, state)
                start_sample = sample
            elif _is_ascending(angle, previous_angle, movement_epsilon) or angle >= (
                down_angle + hysteresis
            ):
                state = _enter_phase(phases, "up", sample, state)

        elif state == "up":
            if angle >= up_angle:
                state = _enter_phase(phases, "complete", sample, state)
                start_sample = sample
            elif angle <= down_angle:
                state = _enter_phase(phases, "bottom", sample, state)

        previous_sample = sample

    angles = [float(sample.angle) for sample in angle_samples]
    confidences = [float(sample.confidence) for sample in angle_samples]
    min_angle = min(angles)
    max_angle = max(angles)
    return PushupPhaseDetectionResult(
        repetitions=len(count_result.valid_reps),
        phases=phases,
        min_angle=min_angle,
        max_angle=max_angle,
        angle_range=max_angle - min_angle,
        average_confidence=sum(confidences) / len(confidences),
        repetition_details=count_result.valid_reps,
        invalid_repetition_details=count_result.invalid_reps,
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
