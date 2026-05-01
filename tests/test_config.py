import pytest
from pydantic import ValidationError

from app.config import Settings


class TestSettings:
    def test_settings_accept_valid_critical_values(self):
        settings = Settings(
            DATABASE_URL="sqlite:///./test.db",
            SECRET_KEY="valid-secret-key-for-tests-123456789",
        )

        assert settings.DATABASE_URL == "sqlite:///./test.db"
        assert settings.SECRET_KEY == "valid-secret-key-for-tests-123456789"

    def test_settings_reject_placeholder_database_url(self):
        with pytest.raises(ValidationError):
            Settings(
                DATABASE_URL="postgresql://user:password@localhost:5432/fitness_ai",
                SECRET_KEY="valid-secret-key-for-tests-123456789",
            )

    def test_settings_reject_placeholder_secret_key(self):
        with pytest.raises(ValidationError):
            Settings(
                DATABASE_URL="sqlite:///./test.db",
                SECRET_KEY="your-secret-key-change-in-production",
            )
