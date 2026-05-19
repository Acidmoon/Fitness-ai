"""Property test for unavailable backend early rejection.

Feature: pose-analysis-abstraction, Property 9: Unavailable Backend Early Rejection

For any backend that returns False from is_available(), the Video_Analysis_Service
SHALL raise PoseAnalysisUnavailableError without invoking analyze_frame.

**Validates: Requirements 5.5**
"""

import sys
from unittest.mock import MagicMock, patch

import pytest
from hypothesis import given, settings as hypothesis_settings
from hypothesis import strategies as st

from app.services.pose_analysis_runtime import PoseAnalysisUnavailableError
from app.services.video_pose_analysis import analyze_video_file


# Strategy: generate valid Python identifier-style backend names
backend_name_strategy = st.from_regex(r"[a-z][a-z0-9_]{0,19}", fullmatch=True)


@given(backend_name=backend_name_strategy)
@hypothesis_settings(max_examples=20)
def test_unavailable_backend_raises_without_calling_analyze_frame(
    backend_name: str,
) -> None:
    """Property 9: Unavailable Backend Early Rejection.

    For any backend that returns False from is_available(), the
    Video_Analysis_Service SHALL raise PoseAnalysisUnavailableError
    without invoking analyze_frame.

    Feature: pose-analysis-abstraction, Property 9: Unavailable Backend Early Rejection
    **Validates: Requirements 5.5**
    """
    # Create a mock backend where is_available() returns False
    mock_backend = MagicMock()
    mock_backend.backend_name = backend_name
    mock_backend.is_available.return_value = False
    mock_backend.analyze_frame = MagicMock()

    # Mock cv2.VideoCapture so the function can open the video file
    # The function imports cv2 inside itself, so we patch it in sys.modules
    mock_cv2 = MagicMock()
    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = True
    mock_cv2.VideoCapture.return_value = mock_cap

    with patch.dict(sys.modules, {"cv2": mock_cv2}):
        with pytest.raises(PoseAnalysisUnavailableError):
            analyze_video_file("/fake/video.mp4", backend=mock_backend)

    # Assert analyze_frame was never called
    mock_backend.analyze_frame.assert_not_called()
