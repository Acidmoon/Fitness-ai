"""Property-based test for error type correctness and propagation.

Feature: pose-analysis-abstraction, Property 10: Error Type Correctness and Propagation

For any PoseAnalysisRuntimeError subclass raised by a backend's `analyze_frame` method,
the Video_Analysis_Service SHALL propagate the exact same exception type and message
without wrapping or transformation.

Validates: Requirements 7.1, 7.2, 7.3, 7.4
"""

from __future__ import annotations

import sys
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.pose_analysis_runtime import (
    PoseAnalysisDisabledError,
    PoseAnalysisInferenceError,
    PoseAnalysisRuntimeError,
    PoseAnalysisUnavailableError,
)
from app.services.video_pose_analysis import analyze_video_file


ERROR_TYPES = [
    PoseAnalysisDisabledError,
    PoseAnalysisUnavailableError,
    PoseAnalysisInferenceError,
]


@settings(max_examples=20)
@given(
    error_type=st.sampled_from(ERROR_TYPES),
    error_message=st.text(min_size=1, max_size=100),
)
def test_error_type_correctness_and_propagation(
    error_type: type, error_message: str
) -> None:
    """**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

    For any PoseAnalysisRuntimeError subclass raised by a backend's analyze_frame
    method, the Video_Analysis_Service SHALL propagate the exact same exception type
    and message without wrapping or transformation.
    """
    # Create a mock backend where analyze_frame raises the generated error
    mock_backend = MagicMock()
    mock_backend.is_available.return_value = True
    mock_backend.backend_name = "test"
    mock_backend.analyze_frame.side_effect = error_type(error_message)

    # Create a fake frame (numpy-like array with shape attribute)
    fake_frame = MagicMock()
    fake_frame.shape = (480, 640, 3)

    # Mock cv2.VideoCapture to return a mock that provides one frame
    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = True
    mock_cap.get.side_effect = lambda prop: {
        5: 30.0,    # cv2.CAP_PROP_FPS
        7: 10.0,    # cv2.CAP_PROP_FRAME_COUNT
    }.get(prop, 0.0)
    # First call returns a frame so it enters the loop and calls analyze_frame
    mock_cap.read.side_effect = [(True, fake_frame), (False, None)]

    # Create a mock cv2 module and inject it into sys.modules
    mock_cv2 = MagicMock()
    mock_cv2.VideoCapture.return_value = mock_cap
    mock_cv2.CAP_PROP_FPS = 5
    mock_cv2.CAP_PROP_FRAME_COUNT = 7

    original_cv2 = sys.modules.get("cv2")
    sys.modules["cv2"] = mock_cv2
    try:
        with pytest.raises(error_type) as exc_info:
            analyze_video_file("test_video.mp4", backend=mock_backend)

        # Assert the exact same exception type is raised (not wrapped)
        assert type(exc_info.value) is error_type
        # Assert the error message matches exactly
        assert str(exc_info.value) == error_message
    finally:
        # Restore original cv2 module state
        if original_cv2 is not None:
            sys.modules["cv2"] = original_cv2
        else:
            sys.modules.pop("cv2", None)
