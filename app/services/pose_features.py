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


@dataclass(frozen=True)
class BodyLineSample:
    """One frame's body-line deviation from a straight shoulder-hip-ankle chain."""

    frame_index: int
    timestamp_ms: int
    deviation: float
    confidence: float


@dataclass(frozen=True)
class BodyLineOffsetSample:
    """One frame's *signed* hip offset from the shoulder-ankle line.

    `offset_ratio` 是髋点到肩-踝连线的垂距占肩踝跨度的比例：正值表示髋在连线下方
    （塌腰），负值表示髋在连线上方（撅臀）。偏差绝对值无法区分这两类错误，
    但它们的纠正建议相反，因此必须保留符号。
    """

    frame_index: int
    timestamp_ms: int
    offset_ratio: float
    confidence: float


@dataclass(frozen=True)
class SymmetrySample:
    """One frame's left-right joint-angle difference for a mirrored movement."""

    frame_index: int
    timestamp_ms: int
    difference: float
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


def average_keypoint_confidence(
    keypoints_by_name: Dict[str, Dict[str, Any]], keypoint_names: Iterable[str]
) -> float:
    scores = [
        float(keypoints_by_name[name].get("score", 0))
        for name in keypoint_names
        if name in keypoints_by_name
    ]
    if not scores:
        raise PoseFeatureError("缺少可用于置信度计算的关键点")

    return sum(scores) / len(scores)


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


def extract_body_line_samples(
    frames: Sequence[Dict[str, Any]], min_confidence: float
) -> List[BodyLineSample]:
    samples: List[BodyLineSample] = []
    left_chain = ("left_shoulder", "left_hip", "left_ankle")
    right_chain = ("right_shoulder", "right_hip", "right_ankle")

    for frame in frames:
        keypoints_by_name = index_keypoints(frame.get("keypoints") or [])
        deviations: List[float] = []
        confidences: List[float] = []

        for chain in (left_chain, right_chain):
            if not keypoints_have_confidence(keypoints_by_name, chain, min_confidence):
                continue

            angle = calculate_joint_angle(
                keypoints_by_name, chain[0], chain[1], chain[2]
            )
            deviations.append(abs(180.0 - angle))
            confidences.append(average_keypoint_confidence(keypoints_by_name, chain))

        if deviations:
            samples.append(
                BodyLineSample(
                    frame_index=int(frame.get("frame_index", len(samples))),
                    timestamp_ms=int(frame.get("timestamp_ms", 0)),
                    deviation=sum(deviations) / len(deviations),
                    confidence=sum(confidences) / len(confidences),
                )
            )

    return samples


def extract_body_line_offset_samples(
    frames: Sequence[Dict[str, Any]], min_confidence: float
) -> List[BodyLineOffsetSample]:
    """Measure how far the hip sits off the shoulder-ankle line, with direction.

    髋低于体轴为塌腰、高于体轴为撅臀，但这个“上下”只有在俯卧姿势下才有物理意义：
    肩→踝轴接近水平（|axis_y| <= 0.5·|axis_x|）时，图像 y 方向才近似重力方向。
    轴接近竖直时（站立、坐姿或机位不对）返回的帧被丢弃，调用方因此拿不到方向，
    只能退回“身体未保持平直”这一无方向结论，而不是凭空判定塌腰或撅臀。

    偏移按肩踝跨度归一化，因此与身高和画面尺度无关；符号再按肩→踝的 x 分量规范化，
    避免受试者头朝左还是朝右影响结论。
    """
    samples: List[BodyLineOffsetSample] = []
    chains = (
        ("left_shoulder", "left_hip", "left_ankle"),
        ("right_shoulder", "right_hip", "right_ankle"),
    )

    for frame in frames:
        keypoints_by_name = index_keypoints(frame.get("keypoints") or [])
        ratios: List[float] = []
        confidences: List[float] = []

        for shoulder_name, hip_name, ankle_name in chains:
            chain = (shoulder_name, hip_name, ankle_name)
            if not keypoints_have_confidence(keypoints_by_name, chain, min_confidence):
                continue

            shoulder = keypoints_by_name[shoulder_name]
            hip = keypoints_by_name[hip_name]
            ankle = keypoints_by_name[ankle_name]
            axis_x = float(ankle["x"]) - float(shoulder["x"])
            axis_y = float(ankle["y"]) - float(shoulder["y"])
            span_squared = axis_x * axis_x + axis_y * axis_y
            if span_squared < 1e-6:
                continue
            # 只有接近水平的体轴才让“髋在连线上方/下方”等价于重力方向的塌腰/撅臀。
            if abs(axis_y) > 0.5 * abs(axis_x):
                continue

            cross = axis_x * (float(hip["y"]) - float(shoulder["y"])) - axis_y * (
                float(hip["x"]) - float(shoulder["x"])
            )
            # 图像 y 轴向下：cross>0 表示髋在体轴下方（髋下沉）。
            # 受试者左右朝向相反时 axis_x 变号，因此按 axis_x 符号规范化。
            facing = 1.0 if axis_x >= 0 else -1.0
            ratios.append(cross * facing / span_squared)
            confidences.append(average_keypoint_confidence(keypoints_by_name, chain))

        if ratios:
            samples.append(
                BodyLineOffsetSample(
                    frame_index=int(frame.get("frame_index", len(samples))),
                    timestamp_ms=int(frame.get("timestamp_ms", 0)),
                    offset_ratio=sum(ratios) / len(ratios),
                    confidence=sum(confidences) / len(confidences),
                )
            )

    return samples


def extract_symmetry_samples(
    frames: Sequence[Dict[str, Any]],
    left_triplet: JointTriplet,
    right_triplet: JointTriplet,
    min_confidence: float,
) -> List[SymmetrySample]:
    samples: List[SymmetrySample] = []

    for frame in frames:
        keypoints_by_name = index_keypoints(frame.get("keypoints") or [])
        left_names = (left_triplet.start, left_triplet.middle, left_triplet.end)
        right_names = (right_triplet.start, right_triplet.middle, right_triplet.end)
        if not keypoints_have_confidence(keypoints_by_name, left_names, min_confidence):
            continue
        if not keypoints_have_confidence(keypoints_by_name, right_names, min_confidence):
            continue

        left_angle = calculate_joint_angle(
            keypoints_by_name,
            left_triplet.start,
            left_triplet.middle,
            left_triplet.end,
        )
        right_angle = calculate_joint_angle(
            keypoints_by_name,
            right_triplet.start,
            right_triplet.middle,
            right_triplet.end,
        )
        samples.append(
            SymmetrySample(
                frame_index=int(frame.get("frame_index", len(samples))),
                timestamp_ms=int(frame.get("timestamp_ms", 0)),
                difference=abs(left_angle - right_angle),
                confidence=average_keypoint_confidence(
                    keypoints_by_name, (*left_names, *right_names)
                ),
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
