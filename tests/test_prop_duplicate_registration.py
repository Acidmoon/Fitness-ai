"""Property-based test for duplicate registration rejection.

Feature: pose-analysis-abstraction, Property 4: Duplicate Registration Rejection

For any backend identifier string, if it is already registered in the
BackendRegistry, attempting to register another factory under the same
identifier SHALL raise ValueError.

Validates: Requirements 3.2
"""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from unittest.mock import MagicMock

from app.services.pose_backends.registry import BackendRegistry


# Strategy: valid backend identifier strings
# Lowercase alphanumeric + hyphens/underscores, starting with alphanumeric
valid_identifier = st.from_regex(r"[a-z0-9][a-z0-9_\-]{0,49}", fullmatch=True)


@settings(max_examples=20)
@given(identifier=valid_identifier)
def test_duplicate_registration_raises_value_error(identifier: str) -> None:
    """**Validates: Requirements 3.2**

    Property 4: For any backend identifier string, if it is already registered
    in the BackendRegistry, attempting to register another factory under the
    same identifier SHALL raise ValueError.
    """
    # Create a fresh registry for each test case
    registry = BackendRegistry()

    # Create two distinct factory callables
    factory_1 = MagicMock(return_value=MagicMock())
    factory_2 = MagicMock(return_value=MagicMock())

    # First registration should succeed
    registry.register(identifier, factory_1)

    # Second registration with the same identifier should raise ValueError
    with pytest.raises(ValueError):
        registry.register(identifier, factory_2)
