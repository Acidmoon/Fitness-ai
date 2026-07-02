from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Sequence


class PoseFeatureError(Exception):
    """Raised when canonical pose frames cannot produce stable features."""


@dataclass(frozen=True)
class JointTriplet:
    """Three keypoints that define a joint angle at the middle keypoint."""

    start: str
    middle: str
    end: str


@dataclass(frozen=True)
class AngleSample:
    """One sampled joint-angle point used by phase and repetition detectors."""

    frame_index: int
    timestamp_ms: int
    angle: float
    confidence: float


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
        raise PoseFeatureError("关键点坐标重合，无法计算关节角")

    cosine = (vector_a[0] * vector_b[0] + vector_a[1] * vector_b[1]) / (
        magnitude_a * magnitude_b
    )
    return math.degrees(math.acos(max(-1.0, min(1.0, cosine))))


def extract_angle_samples(
    frames: Sequence[Dict[str, Any]],
    joint_triplets: Sequence[JointTriplet],
    min_confidence: float,
) -> List[AngleSample]:
    samples: List[AngleSample] = []
    for frame in frames:
        keypoints_by_name = index_keypoints(frame.get("keypoints") or [])
        triplet_angles: List[float] = []
        triplet_confidences: List[float] = []

        for triplet in joint_triplets:
            triplet_names = (triplet.start, triplet.middle, triplet.end)
            if not keypoints_have_confidence(
                keypoints_by_name, triplet_names, min_confidence
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


def index_keypoints(keypoints: Sequence[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {
        str(keypoint.get("name")): keypoint
        for keypoint in keypoints
        if keypoint.get("name")
    }


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
