"""Property-based test for unknown backend rejection.

Feature: pose-analysis-abstraction, Property 5: Unknown Backend Rejection

For any backend identifier string that is not registered in the BackendRegistry,
calling `get_backend(identifier)` SHALL raise PoseAnalysisUnavailableError with
the identifier name present in the error message.

Validates: Requirements 3.4
"""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.pose_analysis_runtime import PoseAnalysisUnavailableError
from app.services.pose_backends.registry import BackendRegistry


@settings(max_examples=20)
@given(identifier=st.text(min_size=1, max_size=30))
def test_unknown_backend_raises_unavailable_error(identifier: str) -> None:
    """Property 5: Unknown Backend Rejection.

    For any arbitrary non-empty string identifier, calling get_backend on an
    empty registry SHALL raise PoseAnalysisUnavailableError with the identifier
    present in the error message.

    **Validates: Requirements 3.4**
    """
    # Create a fresh empty registry for each test case
    registry = BackendRegistry()

    # Calling get_backend with an unregistered identifier must raise
    with pytest.raises(PoseAnalysisUnavailableError) as exc_info:
        registry.get_backend(identifier)

    # The identifier must appear in the error message
    assert identifier in str(exc_info.value), (
        f"Expected identifier '{identifier}' to appear in error message, "
        f"got: '{exc_info.value}'"
    )
