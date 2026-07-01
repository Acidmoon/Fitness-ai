from __future__ import annotations

from typing import Any, Dict, Protocol, runtime_checkable

from app.services.pose_keypoint_result import (
    POSE_KEYPOINT_COORDINATE_SPACE,
    POSE_KEYPOINT_SCHEMA_VERSION,
    STANDARD_KEYPOINT_NAMES,
    normalize_keypoint_result,
)


@runtime_checkable
class PoseAnalysisBackend(Protocol):
    """Protocol defining the interface for pose analysis backends.

    Any class implementing these methods is accepted by the BackendRegistry
    without requiring inheritance.

    KeypointResult format:
        {
            "schema_version": 1,
            "model": {
                "backend": str,
                "name": str,
                "input_size": int | None,
                ...
            },
            "frame": {
                "width": int | None,
                "height": int | None,
                "timestamp_ms": int | None,
            },
            "coordinate_space": "image_pixels",
            "keypoints": [
                {"name": str, "x": float, "y": float, "score": float},
                ...  # 17 standard keypoints
            ]
        }

    Standard keypoint names (used by ScoringService):
        nose, left_eye, right_eye, left_ear, right_ear,
        left_shoulder, right_shoulder, left_elbow, right_elbow,
        left_wrist, right_wrist, left_hip, right_hip,
        left_knee, right_knee, left_ankle, right_ankle

    Error contract:
        - PoseAnalysisDisabledError: backend is configured but explicitly disabled
        - PoseAnalysisUnavailableError: dependencies or model files missing
        - PoseAnalysisInferenceError: frame analysis fails during execution
    """

    @property
    def backend_name(self) -> str:
        """Return the unique identifier string for this backend."""
        ...

    def is_available(self) -> bool:
        """Return True if the backend can perform inference."""
        ...

    def analyze_frame(self, frame_bgr: Any) -> Dict[str, Any]:
        """Analyze a single BGR frame and return a KeypointResult dict.

        Args:
            frame_bgr: A numpy array of shape (H, W, 3) in BGR color order.

        Returns:
            Dict with "model" and "keypoints" keys conforming to KeypointResult.

        Raises:
            PoseAnalysisDisabledError: If backend is disabled.
            PoseAnalysisUnavailableError: If dependencies are missing.
            PoseAnalysisInferenceError: If inference fails.
        """
        ...


__all__ = [
    "POSE_KEYPOINT_COORDINATE_SPACE",
    "POSE_KEYPOINT_SCHEMA_VERSION",
    "STANDARD_KEYPOINT_NAMES",
    "PoseAnalysisBackend",
    "normalize_keypoint_result",
]
