"""Tests for PoseAnalysisBackend protocol conformance.

Validates:
- Requirement 1.4: Classes implementing all protocol methods are accepted without inheritance
- Requirement 2.1: MoveNetBackend implements the Backend Protocol
"""

import pytest

from app.services.pose_backends.protocol import PoseAnalysisBackend


class FullyCompliantBackend:
    """A mock backend that implements all protocol methods."""

    @property
    def backend_name(self) -> str:
        return "compliant"

    def is_available(self) -> bool:
        return True

    def analyze_frame(self, frame_bgr):
        return {
            "model": {"name": "test"},
            "keypoints": [],
        }


class MissingAnalyzeFrame:
    """A class missing the analyze_frame method."""

    @property
    def backend_name(self) -> str:
        return "incomplete"

    def is_available(self) -> bool:
        return True


class MissingIsAvailable:
    """A class missing the is_available method."""

    @property
    def backend_name(self) -> str:
        return "incomplete"

    def analyze_frame(self, frame_bgr):
        return {}


class MissingBackendName:
    """A class missing the backend_name property."""

    def is_available(self) -> bool:
        return True

    def analyze_frame(self, frame_bgr):
        return {}


def test_compliant_class_satisfies_protocol():
    """A class implementing all protocol methods passes isinstance check."""
    obj = FullyCompliantBackend()
    assert isinstance(obj, PoseAnalysisBackend)


def test_class_missing_analyze_frame_does_not_satisfy_protocol():
    """A class missing analyze_frame does not pass isinstance check."""
    obj = MissingAnalyzeFrame()
    assert not isinstance(obj, PoseAnalysisBackend)


def test_class_missing_is_available_does_not_satisfy_protocol():
    """A class missing is_available does not pass isinstance check."""
    obj = MissingIsAvailable()
    assert not isinstance(obj, PoseAnalysisBackend)


def test_class_missing_backend_name_does_not_satisfy_protocol():
    """A class missing backend_name does not pass isinstance check."""
    obj = MissingBackendName()
    assert not isinstance(obj, PoseAnalysisBackend)


def test_movenet_backend_satisfies_protocol():
    """MoveNetBackend satisfies the PoseAnalysisBackend protocol."""
    from app.services.pose_backends.movenet_backend import MoveNetBackend

    obj = MoveNetBackend()
    assert isinstance(obj, PoseAnalysisBackend)
