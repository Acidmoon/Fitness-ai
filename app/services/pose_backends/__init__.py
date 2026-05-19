from .movenet_backend import MoveNetBackend, create_movenet_backend
from .protocol import PoseAnalysisBackend
from .registry import BackendRegistry, registry

# Auto-register MoveNet backend on import
if not registry.is_registered("movenet"):
    registry.register("movenet", create_movenet_backend)

__all__ = [
    "PoseAnalysisBackend",
    "BackendRegistry",
    "registry",
    "MoveNetBackend",
    "create_movenet_backend",
]
