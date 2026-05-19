from __future__ import annotations

from threading import RLock
from typing import Any, Dict

from app.services.pose_analysis_runtime import (
    MoveNetRuntime,
    PoseAnalysisDisabledError,
    PoseAnalysisUnavailableError,
    PoseRuntimeConfig,
)

from .protocol import PoseAnalysisBackend


class MoveNetBackend:
    """MoveNet pose analysis backend wrapping the existing MoveNetRuntime.

    Implements PoseAnalysisBackend protocol via structural typing.
    Thread-safe lazy initialization of the underlying MoveNetRuntime.
    """

    def __init__(self, config: PoseRuntimeConfig | None = None) -> None:
        self._config = config or PoseRuntimeConfig.from_settings()
        self._runtime: MoveNetRuntime | None = None
        self._lock = RLock()

    @property
    def backend_name(self) -> str:
        return "movenet"

    def is_available(self) -> bool:
        if not self._config.enabled:
            return False
        try:
            from app.services.pose_analysis_runtime import (
                resolve_movenet_model_path,
                _load_optional_dependencies,
            )

            resolve_movenet_model_path(self._config)
            _load_optional_dependencies()
            return True
        except (PoseAnalysisDisabledError, PoseAnalysisUnavailableError):
            return False

    def analyze_frame(self, frame_bgr: Any) -> Dict[str, Any]:
        if not self._config.enabled:
            raise PoseAnalysisDisabledError("MoveNet pose analysis is disabled")

        with self._lock:
            if self._runtime is None:
                self._runtime = MoveNetRuntime(config=self._config)

        return self._runtime.analyze_frame(frame_bgr)


def create_movenet_backend() -> MoveNetBackend:
    """Factory function for the MoveNet backend."""
    return MoveNetBackend()
