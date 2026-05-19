"""Property-based test for Registry Round-Trip.

Feature: pose-analysis-abstraction, Property 3: Registry Round-Trip

For any valid backend identifier string and any callable factory that returns a
PoseAnalysisBackend-compatible instance, registering the factory and then calling
`get_backend(identifier)` SHALL return an instance produced by that factory.

Validates: Requirements 3.1, 3.3, 8.1, 8.2, 1.4
"""

from typing import Any, Dict
from unittest.mock import MagicMock

from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.pose_backends.protocol import PoseAnalysisBackend
from app.services.pose_backends.registry import BackendRegistry


# Strategy: valid backend identifiers — lowercase alphanumeric + hyphens/underscores,
# starting with alphanumeric, max length 21 characters.
valid_identifier_st = st.from_regex(r"^[a-z0-9][a-z0-9_-]{0,20}$", fullmatch=True)


class _FakeBackend:
    """Minimal PoseAnalysisBackend-compatible class for testing."""

    def __init__(self, name: str) -> None:
        self._name = name

    @property
    def backend_name(self) -> str:
        return self._name

    def is_available(self) -> bool:
        return True

    def analyze_frame(self, frame_bgr: Any) -> Dict[str, Any]:
        return {"model": {"name": self._name}, "keypoints": []}


@given(identifier=valid_identifier_st)
@settings(max_examples=20)
def test_registry_round_trip(identifier: str) -> None:
    """Registering a factory and calling get_backend returns the factory's instance.

    Feature: pose-analysis-abstraction, Property 3: Registry Round-Trip
    Validates: Requirements 3.1, 3.3, 8.1, 8.2, 1.4
    """
    # Create a fresh registry for each test case
    registry = BackendRegistry()

    # Create a backend instance and a factory that returns it
    backend_instance = _FakeBackend(identifier)
    factory = MagicMock(return_value=backend_instance)

    # Register the factory under the generated identifier
    registry.register(identifier, factory)

    # Retrieve the backend via get_backend
    result = registry.get_backend(identifier)

    # The returned instance must be the exact same object the factory produced
    assert result is backend_instance

    # The factory must have been called exactly once
    factory.assert_called_once()

    # The result satisfies the PoseAnalysisBackend protocol
    assert isinstance(result, PoseAnalysisBackend)
