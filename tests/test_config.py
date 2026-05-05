import pytest
from pydantic import ValidationError

from app.config import Settings


class TestSettings:
    def test_settings_accept_valid_critical_values(self):
        settings = Settings(
            ENVIRONMENT="development",
            DATABASE_URL="sqlite:///./test.db",
            SECRET_KEY="valid-secret-key-for-tests-123456789",
        )

        assert settings.ENVIRONMENT == "development"
        assert settings.DATABASE_URL == "sqlite:///./test.db"
        assert settings.SECRET_KEY == "valid-secret-key-for-tests-123456789"
        assert settings.MOVENET_ENABLED is False
        assert settings.MOVENET_MODEL_VARIANT == "thunder"
        assert settings.MOVENET_MIN_CONFIDENCE == 0.3
        assert settings.MOVENET_SAMPLE_FPS == 5
        assert settings.VIDEO_STORAGE_BACKEND == "local"
        assert settings.VIDEO_UPLOAD_DIR == "uploads/videos"

    def test_settings_reject_placeholder_database_url(self):
        with pytest.raises(ValidationError):
            Settings(
                ENVIRONMENT="production",
                DATABASE_URL="postgresql://user:password@localhost:5432/fitness_ai",
                SECRET_KEY="valid-secret-key-for-tests-123456789",
            )

    def test_settings_reject_placeholder_secret_key(self):
        with pytest.raises(ValidationError):
            Settings(
                ENVIRONMENT="production",
                DATABASE_URL="sqlite:///./test.db",
                SECRET_KEY="your-secret-key-change-in-production",
            )

    def test_settings_reject_example_secret_key(self):
        with pytest.raises(ValidationError):
            Settings(
                ENVIRONMENT="production",
                DATABASE_URL="sqlite:///./test.db",
                SECRET_KEY="your-random-secret-key-here-use-openssl-rand-hex-32",
            )

    def test_settings_reject_invalid_environment(self):
        with pytest.raises(ValidationError):
            Settings(
                ENVIRONMENT="local",
                DATABASE_URL="sqlite:///./test.db",
                SECRET_KEY="valid-secret-key-for-tests-123456789",
            )

    def test_settings_accept_test_environment(self):
        settings = Settings(
            ENVIRONMENT="test",
            DATABASE_URL="sqlite:///./test.db",
            SECRET_KEY="valid-secret-key-for-tests-123456789",
        )

        assert settings.ENVIRONMENT == "test"

    def test_settings_reject_invalid_movenet_variant(self):
        with pytest.raises(ValidationError):
            Settings(
                DATABASE_URL="sqlite:///./test.db",
                SECRET_KEY="valid-secret-key-for-tests-123456789",
                MOVENET_MODEL_VARIANT="invalid",
            )

    def test_settings_reject_invalid_movenet_confidence(self):
        with pytest.raises(ValidationError):
            Settings(
                DATABASE_URL="sqlite:///./test.db",
                SECRET_KEY="valid-secret-key-for-tests-123456789",
                MOVENET_MIN_CONFIDENCE=1.5,
            )

    def test_settings_reject_invalid_movenet_sample_fps(self):
        with pytest.raises(ValidationError):
            Settings(
                DATABASE_URL="sqlite:///./test.db",
                SECRET_KEY="valid-secret-key-for-tests-123456789",
                MOVENET_SAMPLE_FPS=0,
            )

    def test_settings_reject_unsupported_video_storage_backend(self):
        with pytest.raises(ValidationError):
            Settings(
                DATABASE_URL="sqlite:///./test.db",
                SECRET_KEY="valid-secret-key-for-tests-123456789",
                VIDEO_STORAGE_BACKEND="s3",
            )
