"""Unit tests for BackendRegistry.

Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
"""

from unittest.mock import MagicMock

import pytest

from app.services.pose_analysis_runtime import PoseAnalysisUnavailableError
from app.services.pose_backends.registry import BackendRegistry


class TestRegisterAndGetBackend:
    """Test register() stores factory and get_backend() returns instance (Req 3.1, 3.3)."""

    def test_register_and_get_backend_returns_instance(self):
        reg = BackendRegistry()
        mock_backend = MagicMock()
        factory = MagicMock(return_value=mock_backend)

        reg.register("test-backend", factory)
        result = reg.get_backend("test-backend")

        assert result is mock_backend
        factory.assert_called_once()

    def test_is_registered_returns_true_after_register(self):
        reg = BackendRegistry()
        factory = MagicMock(return_value=MagicMock())

        reg.register("my-backend", factory)

        assert reg.is_registered("my-backend") is True

    def test_is_registered_returns_false_for_unknown(self):
        reg = BackendRegistry()

        assert reg.is_registered("unknown") is False


class TestDuplicateRegistration:
    """Test duplicate registration raises ValueError (Req 3.2)."""

    def test_duplicate_registration_raises_value_error(self):
        reg = BackendRegistry()
        factory = MagicMock(return_value=MagicMock())

        reg.register("dup-backend", factory)

        with pytest.raises(ValueError, match="already registered"):
            reg.register("dup-backend", factory)


class TestUnknownIdentifier:
    """Test unknown identifier raises PoseAnalysisUnavailableError (Req 3.4)."""

    def test_unknown_identifier_raises_unavailable_error(self):
        reg = BackendRegistry()

        with pytest.raises(PoseAnalysisUnavailableError, match="no-such-backend"):
            reg.get_backend("no-such-backend")

    def test_error_message_contains_identifier(self):
        reg = BackendRegistry()

        with pytest.raises(PoseAnalysisUnavailableError) as exc_info:
            reg.get_backend("missing-xyz")

        assert "missing-xyz" in str(exc_info.value)


class TestLazyInstantiation:
    """Test lazy instantiation: factory called once, same instance returned (Req 3.5)."""

    def test_factory_called_once_on_multiple_get_backend_calls(self):
        reg = BackendRegistry()
        mock_backend = MagicMock()
        factory = MagicMock(return_value=mock_backend)

        reg.register("lazy-backend", factory)

        first = reg.get_backend("lazy-backend")
        second = reg.get_backend("lazy-backend")
        third = reg.get_backend("lazy-backend")

        factory.assert_called_once()
        assert first is second is third

    def test_factory_not_called_until_get_backend(self):
        reg = BackendRegistry()
        factory = MagicMock(return_value=MagicMock())

        reg.register("deferred", factory)

        factory.assert_not_called()

        reg.get_backend("deferred")
        factory.assert_called_once()


class TestReset:
    """Test reset() clears all state (Req 3.5)."""

    def test_reset_clears_registrations(self):
        reg = BackendRegistry()
        factory = MagicMock(return_value=MagicMock())

        reg.register("to-clear", factory)
        assert reg.is_registered("to-clear") is True

        reg.reset()

        assert reg.is_registered("to-clear") is False

    def test_reset_clears_cached_instances(self):
        reg = BackendRegistry()
        mock_backend_1 = MagicMock()
        mock_backend_2 = MagicMock()
        call_count = {"n": 0}

        def factory():
            call_count["n"] += 1
            if call_count["n"] == 1:
                return mock_backend_1
            return mock_backend_2

        reg.register("resettable", factory)
        first = reg.get_backend("resettable")
        assert first is mock_backend_1

        reg.reset()

        # Re-register after reset and get a new instance
        reg.register("resettable", factory)
        second = reg.get_backend("resettable")
        assert second is mock_backend_2
        assert first is not second


class TestAutoRegistrationMovenet:
    """Test auto-registration of 'movenet' on package import (Req 3.6)."""

    def test_movenet_registered_on_package_import(self):
        from app.services.pose_backends import registry

        assert registry.is_registered("movenet") is True

    def test_movenet_in_registered_identifiers(self):
        from app.services.pose_backends import registry

        assert "movenet" in registry.registered_identifiers()


class TestGetBackendUsesSettings:
    """Test get_backend() without identifier reads settings.POSE_ANALYSIS_BACKEND."""

    def test_get_backend_uses_configured_identifier(self, monkeypatch):
        reg = BackendRegistry()
        mock_backend = MagicMock()
        factory = MagicMock(return_value=mock_backend)

        reg.register("configured-be", factory)

        from app import config

        monkeypatch.setattr(config.settings, "POSE_ANALYSIS_BACKEND", "configured-be")

        result = reg.get_backend()

        assert result is mock_backend
