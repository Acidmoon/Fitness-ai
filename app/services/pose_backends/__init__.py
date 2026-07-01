from .movenet_backend import MoveNetBackend, create_movenet_backend
from .protocol import (
    POSE_KEYPOINT_COORDINATE_SPACE,
    POSE_KEYPOINT_SCHEMA_VERSION,
    STANDARD_KEYPOINT_NAMES,
    PoseAnalysisBackend,
    normalize_keypoint_result,
)
from .registry import BackendRegistry, registry

# Auto-register MoveNet backend on import
if not registry.is_registered("movenet"):
    registry.register("movenet", create_movenet_backend)

__all__ = [
    "PoseAnalysisBackend",
    "POSE_KEYPOINT_COORDINATE_SPACE",
    "POSE_KEYPOINT_SCHEMA_VERSION",
    "STANDARD_KEYPOINT_NAMES",
    "normalize_keypoint_result",
    "BackendRegistry",
    "registry",
    "MoveNetBackend",
    "create_movenet_backend",
]
