from __future__ import annotations

from math import isfinite
from typing import Any, Dict, List

POSE_KEYPOINT_SCHEMA_VERSION = 1
POSE_KEYPOINT_COORDINATE_SPACE = "image_pixels"

STANDARD_KEYPOINT_NAMES = (
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
)


def normalize_keypoint_result(
    result: Dict[str, Any],
    *,
    backend_name: str,
    frame_width: int | None = None,
    frame_height: int | None = None,
    timestamp_ms: int | None = None,
) -> Dict[str, Any]:
    """Return the canonical pose-backend output used by all adapters."""
    if not isinstance(result, dict):
        raise ValueError("Pose backend result must be a dictionary")

    return {
        "schema_version": POSE_KEYPOINT_SCHEMA_VERSION,
        "model": _normalize_model_metadata(result.get("model"), backend_name),
        "frame": _normalize_frame_metadata(
            result.get("frame"),
            frame_width=frame_width,
            frame_height=frame_height,
            timestamp_ms=timestamp_ms,
        ),
        "coordinate_space": POSE_KEYPOINT_COORDINATE_SPACE,
        "keypoints": _normalize_keypoints(result.get("keypoints")),
    }


def _normalize_model_metadata(model_value: Any, backend_name: str) -> Dict[str, Any]:
    model = dict(model_value or {})
    name = model.get("name") or backend_name
    if not isinstance(name, str) or not name.strip():
        raise ValueError("Pose model name must be a non-empty string")

    normalized = {
        "backend": str(model.get("backend") or backend_name),
        "name": name,
    }

    if model.get("input_size") is not None:
        normalized["input_size"] = _coerce_optional_positive_int(
            model["input_size"], "model.input_size"
        )

    for key, value in model.items():
        if key not in normalized:
            normalized[key] = value

    return normalized


def _normalize_frame_metadata(
    frame_value: Any,
    *,
    frame_width: int | None,
    frame_height: int | None,
    timestamp_ms: int | None,
) -> Dict[str, int]:
    frame = dict(frame_value or {})
    width = frame.get("width", frame_width)
    height = frame.get("height", frame_height)
    timestamp = frame.get("timestamp_ms", timestamp_ms)
    normalized: Dict[str, int] = {}

    if width is not None:
        normalized["width"] = _coerce_optional_positive_int(width, "frame.width")
    if height is not None:
        normalized["height"] = _coerce_optional_positive_int(height, "frame.height")
    if timestamp is not None:
        normalized["timestamp_ms"] = _coerce_non_negative_int(
            timestamp, "frame.timestamp_ms"
        )

    return normalized


def _normalize_keypoints(keypoints_value: Any) -> List[Dict[str, float | str]]:
    if not isinstance(keypoints_value, list):
        raise ValueError("Pose backend result must contain a keypoints list")

    keypoints: List[Dict[str, float | str]] = []
    seen_names: set[str] = set()
    for index, keypoint in enumerate(keypoints_value):
        if not isinstance(keypoint, dict):
            raise ValueError(f"keypoints[{index}] must be a dictionary")

        name = keypoint.get("name")
        if name not in STANDARD_KEYPOINT_NAMES:
            raise ValueError(f"keypoints[{index}].name is not a standard keypoint")
        if name in seen_names:
            raise ValueError(f"Duplicate keypoint name: {name}")
        seen_names.add(name)

        keypoints.append(
            {
                "name": name,
                "x": _coerce_finite_float(keypoint.get("x"), f"keypoints[{index}].x"),
                "y": _coerce_finite_float(keypoint.get("y"), f"keypoints[{index}].y"),
                "score": _coerce_score(
                    keypoint.get("score"), f"keypoints[{index}].score"
                ),
            }
        )

    return keypoints


def _coerce_finite_float(value: Any, field_name: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be numeric") from exc
    if not isfinite(result):
        raise ValueError(f"{field_name} must be finite")
    return result


def _coerce_score(value: Any, field_name: str) -> float:
    score = _coerce_finite_float(value, field_name)
    if score < 0 or score > 1:
        raise ValueError(f"{field_name} must be between 0 and 1")
    return score


def _coerce_optional_positive_int(value: Any, field_name: str) -> int:
    result = _coerce_non_negative_int(value, field_name)
    if result <= 0:
        raise ValueError(f"{field_name} must be positive")
    return result


def _coerce_non_negative_int(value: Any, field_name: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be an integer")
    try:
        result = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be an integer") from exc
    if result < 0:
        raise ValueError(f"{field_name} must be non-negative")
    return result
