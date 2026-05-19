import pytest
from pydantic import ValidationError

from app.config import Settings


class TestPoseAnalysisBackendConfig:
    """Tests for POSE_ANALYSIS_BACKEND configuration validation.

    Validates Requirements 4.1, 4.2, 4.3, 4.4.
    """

    # --- Requirement 4.1, 4.2: Default value is "movenet" ---

    def test_default_value_is_movenet(self):
        settings = Settings(
            DATABASE_URL="sqlite:///./test.db",
            SECRET_KEY="valid-secret-key-for-tests-123456789",
        )
        assert settings.POSE_ANALYSIS_BACKEND == "movenet"

    # --- Requirement 4.3: Empty string resolves to "movenet" ---

    def test_empty_string_resolves_to_movenet(self):
        settings = Settings(
            DATABASE_URL="sqlite:///./test.db",
            SECRET_KEY="valid-secret-key-for-tests-123456789",
            POSE_ANALYSIS_BACKEND="",
        )
        assert settings.POSE_ANALYSIS_BACKEND == "movenet"

    # --- Requirement 4.4: Valid identifiers accepted ---

    @pytest.mark.parametrize(
        "identifier",
        [
            "movenet",
            "mediapipe",
            "onnx-v2",
            "custom_backend",
            "a1",
        ],
    )
    def test_valid_identifiers_accepted(self, identifier):
        settings = Settings(
            DATABASE_URL="sqlite:///./test.db",
            SECRET_KEY="valid-secret-key-for-tests-123456789",
            POSE_ANALYSIS_BACKEND=identifier,
        )
        assert settings.POSE_ANALYSIS_BACKEND == identifier

    # --- Requirement 4.4: Uppercase is rejected (not normalized) ---

    @pytest.mark.parametrize(
        "identifier",
        [
            "MoveNet",
            "MOVENET",
            "MediaPipe",
        ],
    )
    def test_uppercase_identifiers_rejected(self, identifier):
        with pytest.raises(ValidationError):
            Settings(
                DATABASE_URL="sqlite:///./test.db",
                SECRET_KEY="valid-secret-key-for-tests-123456789",
                POSE_ANALYSIS_BACKEND=identifier,
            )

    # --- Requirement 4.4: Invalid identifiers rejected ---

    @pytest.mark.parametrize(
        "identifier",
        [
            "-leading-hyphen",
            "_leading-underscore",
            "has space",
            "special!char",
        ],
    )
    def test_invalid_identifiers_rejected(self, identifier):
        with pytest.raises(ValidationError):
            Settings(
                DATABASE_URL="sqlite:///./test.db",
                SECRET_KEY="valid-secret-key-for-tests-123456789",
                POSE_ANALYSIS_BACKEND=identifier,
            )
