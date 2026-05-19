"""Unit tests for MoveNetBackend implementation.

Requirements: 2.2, 2.3, 2.4, 2.5, 7.5
"""

import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path

from app.services.pose_analysis_runtime import (
    PoseAnalysisDisabledError,
    PoseAnalysisUnavailableError,
    PoseRuntimeConfig,
)
from app.services.pose_backends.movenet_backend import MoveNetBackend


def _enabled_config() -> PoseRuntimeConfig:
    return PoseRuntimeConfig(
        enabled=True,
        model_path="/fake/model.tflite",
        model_variant="thunder",
        min_confidence=0.3,
        sample_fps=5,
    )


def _disabled_config() -> PoseRuntimeConfig:
    return PoseRuntimeConfig(
        enabled=False,
        model_path="/fake/model.tflite",
        model_variant="thunder",
        min_confidence=0.3,
        sample_fps=5,
    )


class TestIsAvailable:
    """Tests for MoveNetBackend.is_available() — Requirements 2.2, 2.3"""

    def test_returns_true_when_enabled_and_model_exists(self):
        """Requirement 2.2: When enabled and model file exists, is_available returns True."""
        config = _enabled_config()
        backend = MoveNetBackend(config=config)

        with patch(
            "app.services.pose_analysis_runtime.resolve_movenet_model_path"
        ) as mock_resolve, patch(
            "app.services.pose_analysis_runtime._load_optional_dependencies"
        ) as mock_deps:
            mock_resolve.return_value = Path("/fake/model.tflite")
            mock_deps.return_value = (MagicMock(), MagicMock(), MagicMock())
            assert backend.is_available() is True

    def test_returns_false_when_disabled(self):
        """Requirement 2.3: When disabled, is_available returns False."""
        config = _disabled_config()
        backend = MoveNetBackend(config=config)

        assert backend.is_available() is False

    def test_returns_false_when_model_path_unavailable(self):
        """When model resolution fails, is_available returns False."""
        config = _enabled_config()
        backend = MoveNetBackend(config=config)

        with patch(
            "app.services.pose_analysis_runtime.resolve_movenet_model_path"
        ) as mock_resolve:
            mock_resolve.side_effect = PoseAnalysisUnavailableError("model not found")
            assert backend.is_available() is False


class TestAnalyzeFrame:
    """Tests for MoveNetBackend.analyze_frame() — Requirements 2.4, 2.5"""

    def test_raises_disabled_error_when_disabled(self):
        """Requirement 2.4: analyze_frame raises PoseAnalysisDisabledError when disabled."""
        config = _disabled_config()
        backend = MoveNetBackend(config=config)

        fake_frame = MagicMock()
        with pytest.raises(PoseAnalysisDisabledError, match="disabled"):
            backend.analyze_frame(fake_frame)

    def test_raises_unavailable_error_when_tflite_missing(self):
        """Requirement 2.5: analyze_frame raises PoseAnalysisUnavailableError when TFLite missing."""
        config = _enabled_config()
        backend = MoveNetBackend(config=config)

        fake_frame = MagicMock()
        with patch(
            "app.services.pose_backends.movenet_backend.MoveNetRuntime"
        ) as mock_runtime_cls:
            mock_runtime_instance = MagicMock()
            mock_runtime_instance.analyze_frame.side_effect = (
                PoseAnalysisUnavailableError(
                    "A TensorFlow Lite interpreter is required for MoveNet pose analysis"
                )
            )
            mock_runtime_cls.return_value = mock_runtime_instance

            with pytest.raises(PoseAnalysisUnavailableError, match="TensorFlow Lite"):
                backend.analyze_frame(fake_frame)


class TestBackwardCompatibility:
    """Tests for backward compatibility of exception imports — Requirement 7.5"""

    def test_exceptions_importable_from_pose_analysis_runtime(self):
        """Requirement 7.5: Exception classes remain importable from original module."""
        from app.services.pose_analysis_runtime import PoseAnalysisDisabledError
        from app.services.pose_analysis_runtime import PoseAnalysisUnavailableError
        from app.services.pose_analysis_runtime import PoseAnalysisInferenceError
        from app.services.pose_analysis_runtime import PoseAnalysisRuntimeError

        # Verify they are actual exception classes
        assert issubclass(PoseAnalysisDisabledError, PoseAnalysisRuntimeError)
        assert issubclass(PoseAnalysisUnavailableError, PoseAnalysisRuntimeError)
        assert issubclass(PoseAnalysisInferenceError, PoseAnalysisRuntimeError)
        assert issubclass(PoseAnalysisRuntimeError, Exception)
