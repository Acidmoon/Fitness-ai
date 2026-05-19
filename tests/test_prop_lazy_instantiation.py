"""Property-based test for lazy instantiation and caching.

Feature: pose-analysis-abstraction, Property 6: Lazy Instantiation and Caching

For any registered backend, the factory callable SHALL be invoked exactly once
regardless of how many times `get_backend` is called with that identifier, and
all calls SHALL return the same instance.

**Validates: Requirements 3.5**
"""

from unittest.mock import MagicMock

from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.pose_backends.registry import BackendRegistry


# Strategy for valid backend identifier strings: lowercase alphanumeric start,
# followed by lowercase alphanumeric, hyphens, or underscores.
valid_identifier_st = st.from_regex(r"[a-z0-9][a-z0-9_\-]{0,29}", fullmatch=True)

# Strategy for number of get_backend calls (2 to 20)
num_calls_st = st.integers(min_value=2, max_value=20)


@given(identifier=valid_identifier_st, num_calls=num_calls_st)
@settings(max_examples=20)
def test_factory_invoked_exactly_once_and_same_instance_returned(
    identifier: str, num_calls: int
) -> None:
    """Property 6: Lazy Instantiation and Caching.

    For any registered backend, the factory callable SHALL be invoked exactly
    once regardless of how many times get_backend is called with that identifier,
    and all calls SHALL return the same instance.

    **Validates: Requirements 3.5**
    """
    # Create a fresh registry for each test case
    registry = BackendRegistry()

    # Create a mock backend instance and a factory with a call counter
    mock_backend = MagicMock()
    factory = MagicMock(return_value=mock_backend)

    # Register the factory
    registry.register(identifier, factory)

    # Call get_backend N times
    results = [registry.get_backend(identifier) for _ in range(num_calls)]

    # Assert the factory was called exactly once
    assert factory.call_count == 1, (
        f"Factory was called {factory.call_count} times for {num_calls} "
        f"get_backend calls (expected exactly 1)"
    )

    # Assert all returned instances are the same object
    for i, result in enumerate(results):
        assert result is results[0], (
            f"Call {i} returned a different instance than call 0 "
            f"(expected same object via caching)"
        )
