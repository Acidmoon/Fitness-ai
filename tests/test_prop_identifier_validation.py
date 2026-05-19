"""Property-based tests for backend identifier validation.

Feature: pose-analysis-abstraction, Property 7: Backend Identifier Validation

For any string containing characters outside the set [a-z0-9_-] or starting
with a hyphen/underscore, the Settings validator SHALL reject it. For any
non-empty string composed only of [a-z0-9] starting characters followed by
[a-z0-9_-], the validator SHALL accept it.

**Validates: Requirements 4.4**
"""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from app.config import Settings


# Base kwargs for constructing a valid Settings instance
_BASE_SETTINGS = {
    "DATABASE_URL": "sqlite:///./test.db",
    "SECRET_KEY": "valid-secret-key-for-tests-123456789",
}


class TestValidIdentifiersAccepted:
    """Valid identifiers matching ^[a-z0-9][a-z0-9_-]*$ are accepted."""

    @given(
        identifier=st.from_regex(r"^[a-z0-9][a-z0-9_-]*$", fullmatch=True)
    )
    @settings(max_examples=20)
    def test_valid_identifiers_are_accepted(self, identifier: str) -> None:
        """Any identifier matching the valid pattern is accepted unchanged.

        Feature: pose-analysis-abstraction, Property 7: Backend Identifier Validation
        **Validates: Requirements 4.4**
        """
        result = Settings.validate_pose_analysis_backend(identifier)
        assert result == identifier


class TestInvalidIdentifiersRejected:
    """Invalid identifiers are rejected by the validator."""

    @given(
        identifier=st.one_of(
            # Strings starting with hyphen
            st.from_regex(r"^-[a-z0-9_-]*$", fullmatch=True),
            # Strings starting with underscore
            st.from_regex(r"^_[a-z0-9_-]*$", fullmatch=True),
            # Strings containing uppercase letters (rejected, not normalized)
            st.from_regex(r"^[a-z0-9][a-z0-9_-]*[A-Z][a-z0-9_-]*$", fullmatch=True),
            # Strings containing characters that are always invalid
            # (spaces, special chars like !, @, #, etc.)
            st.from_regex(
                r"^[a-z0-9][a-z0-9_-]*[^a-zA-Z0-9_\-][a-z0-9_-]*$",
                fullmatch=True,
            ),
        )
    )
    @settings(max_examples=20)
    def test_invalid_identifiers_are_rejected(self, identifier: str) -> None:
        """Any identifier violating the pattern raises ValueError.

        Feature: pose-analysis-abstraction, Property 7: Backend Identifier Validation
        **Validates: Requirements 4.4**
        """
        with pytest.raises(ValueError):
            Settings.validate_pose_analysis_backend(identifier)
