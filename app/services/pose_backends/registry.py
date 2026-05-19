from __future__ import annotations

from threading import RLock
from typing import Any, Callable, Dict, Optional

from app.config import settings
from app.services.pose_analysis_runtime import PoseAnalysisUnavailableError

from .protocol import PoseAnalysisBackend


class BackendRegistry:
    """Registry for pose analysis backend discovery and instantiation.

    Maintains a mapping of identifier strings to factory callables.
    Backends are instantiated lazily on first request and cached.
    """

    def __init__(self) -> None:
        self._factories: Dict[str, Callable[[], PoseAnalysisBackend]] = {}
        self._instances: Dict[str, PoseAnalysisBackend] = {}
        self._lock = RLock()

    def register(
        self,
        identifier: str,
        factory: Callable[[], PoseAnalysisBackend],
    ) -> None:
        """Register a backend factory under the given identifier.

        Args:
            identifier: Unique backend identifier string.
            factory: Callable that returns a PoseAnalysisBackend instance.

        Raises:
            ValueError: If identifier is already registered.
        """
        with self._lock:
            if identifier in self._factories:
                raise ValueError(
                    f"Backend identifier '{identifier}' is already registered"
                )
            self._factories[identifier] = factory

    def get_backend(
        self, identifier: Optional[str] = None
    ) -> PoseAnalysisBackend:
        """Return the backend instance for the given or configured identifier.

        Args:
            identifier: Override identifier. Uses settings if None.

        Returns:
            Cached PoseAnalysisBackend instance.

        Raises:
            PoseAnalysisUnavailableError: If identifier is not registered.
        """
        backend_id = identifier or settings.POSE_ANALYSIS_BACKEND
        with self._lock:
            if backend_id in self._instances:
                return self._instances[backend_id]

            factory = self._factories.get(backend_id)
            if factory is None:
                registered = ", ".join(sorted(self._factories.keys())) or "(none)"
                raise PoseAnalysisUnavailableError(
                    f"Pose analysis backend '{backend_id}' is not registered. "
                    f"Available backends: {registered}"
                )

            instance = factory()
            self._instances[backend_id] = instance
            return instance

    def is_registered(self, identifier: str) -> bool:
        """Check if an identifier is registered."""
        return identifier in self._factories

    def registered_identifiers(self) -> list[str]:
        """Return all registered backend identifiers."""
        return list(self._factories.keys())

    def reset(self) -> None:
        """Clear all registrations and cached instances. For testing only."""
        with self._lock:
            self._factories.clear()
            self._instances.clear()


# Module-level singleton
registry = BackendRegistry()
