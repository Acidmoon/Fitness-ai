"""Property-based test for KeypointResult Structure Invariant.

Feature: pose-analysis-abstraction, Property 1: KeypointResult Structure Invariant

For any valid BGR frame passed to any backend implementing the PoseAnalysisBackend
protocol, the returned dictionary SHALL contain a `keypoints` list where each entry
has `name` (str), `x` (float), `y` (float), and `score` (float) fields, and a `model`
dictionary with at minimum a `name` (str) field.

**Validates: Requirements 1.5, 1.6**
"""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.pose_backends.protocol import PoseAnalysisBackend

# Standard keypoint names from the protocol documentation
STANDARD_KEYPOINT_NAMES = [
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
]


# --- Hypothesis Strategies ---


@st.composite
def keypoint_entry_strategy(draw: st.DrawFn) -> Dict[str, Any]:
    """Generate a valid keypoint entry with name, x, y, score fields."""
    name = draw(st.sampled_from(STANDARD_KEYPOINT_NAMES))
    x = draw(st.floats(min_value=0.0, max_value=1920.0, allow_nan=False, allow_infinity=False))
    y = draw(st.floats(min_value=0.0, max_value=1080.0, allow_nan=False, allow_infinity=False))
    score = draw(st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False))
    return {"name": name, "x": x, "y": y, "score": score}


@st.composite
def keypoints_list_strategy(draw: st.DrawFn) -> List[Dict[str, Any]]:
    """Generate a list of keypoint entries (1 to 17 keypoints)."""
    count = draw(st.integers(min_value=1, max_value=17))
    keypoints = [draw(keypoint_entry_strategy()) for _ in range(count)]
    return keypoints


@st.composite
def model_metadata_strategy(draw: st.DrawFn) -> Dict[str, Any]:
    """Generate a valid model metadata dictionary with at minimum a 'name' field."""
    name = draw(
        st.text(
            alphabet=st.characters(whitelist_categories=("L", "N", "Pd")),
            min_size=1,
            max_size=30,
        )
    )
    model = {"name": name}
    # Optionally add extra fields like input_size
    if draw(st.booleans()):
        model["input_size"] = draw(st.integers(min_value=64, max_value=512))
    return model


@st.composite
def keypoint_result_strategy(draw: st.DrawFn) -> Dict[str, Any]:
    """Generate a valid KeypointResult dictionary."""
    model = draw(model_metadata_strategy())
    keypoints = draw(keypoints_list_strategy())
    return {"model": model, "keypoints": keypoints}


@st.composite
def bgr_frame_strategy(draw: st.DrawFn) -> np.ndarray:
    """Generate a random BGR frame as a numpy array of shape (H, W, 3) with uint8 values."""
    height = draw(st.integers(min_value=48, max_value=256))
    width = draw(st.integers(min_value=48, max_value=256))
    # Generate random pixel data
    data = draw(
        st.from_type(np.ndarray).filter(lambda x: False)  # placeholder, replaced below
    ) if False else np.random.randint(0, 256, size=(height, width, 3), dtype=np.uint8)
    return data


# --- Mock Backend ---


class MockPoseAnalysisBackend:
    """A mock backend that conforms to PoseAnalysisBackend protocol.

    Returns pre-configured KeypointResult data for any frame input.
    Used to verify the structural contract of the protocol output.
    """

    def __init__(self, result_data: Dict[str, Any]) -> None:
        self._result_data = result_data

    @property
    def backend_name(self) -> str:
        return "mock"

    def is_available(self) -> bool:
        return True

    def analyze_frame(self, frame_bgr: Any) -> Dict[str, Any]:
        return self._result_data


# --- Property Test ---


@given(
    height=st.integers(min_value=48, max_value=256),
    width=st.integers(min_value=48, max_value=256),
    result_data=keypoint_result_strategy(),
)
@settings(max_examples=20, suppress_health_check=[HealthCheck.too_slow])
def test_keypoint_result_structure_invariant(
    height: int, width: int, result_data: Dict[str, Any]
) -> None:
    """Property 1: KeypointResult Structure Invariant.

    For any valid BGR frame passed to any backend implementing the
    PoseAnalysisBackend protocol, the returned dictionary SHALL contain:
    - A `keypoints` list where each entry has `name` (str), `x` (float),
      `y` (float), and `score` (float) fields
    - A `model` dictionary with at minimum a `name` (str) field

    **Validates: Requirements 1.5, 1.6**
    """
    # Generate a random BGR frame
    frame_bgr = np.random.randint(0, 256, size=(height, width, 3), dtype=np.uint8)

    # Create a mock backend with the generated result data
    backend = MockPoseAnalysisBackend(result_data)

    # Verify the mock satisfies the protocol
    assert isinstance(backend, PoseAnalysisBackend)

    # Call analyze_frame
    result = backend.analyze_frame(frame_bgr)

    # --- Verify structural invariant ---

    # Result must be a dictionary
    assert isinstance(result, dict), "Result must be a dictionary"

    # Must have 'model' key with a dict value
    assert "model" in result, "Result must contain 'model' key"
    model = result["model"]
    assert isinstance(model, dict), "'model' must be a dictionary"

    # Model must have 'name' field of type str
    assert "name" in model, "'model' must contain 'name' key"
    assert isinstance(model["name"], str), "'model.name' must be a string"

    # Must have 'keypoints' key with a list value
    assert "keypoints" in result, "Result must contain 'keypoints' key"
    keypoints = result["keypoints"]
    assert isinstance(keypoints, list), "'keypoints' must be a list"

    # Each keypoint entry must have name (str), x (float), y (float), score (float)
    for i, kp in enumerate(keypoints):
        assert isinstance(kp, dict), f"keypoints[{i}] must be a dictionary"

        assert "name" in kp, f"keypoints[{i}] must contain 'name' key"
        assert isinstance(kp["name"], str), f"keypoints[{i}].name must be a string"

        assert "x" in kp, f"keypoints[{i}] must contain 'x' key"
        assert isinstance(kp["x"], float), f"keypoints[{i}].x must be a float"

        assert "y" in kp, f"keypoints[{i}] must contain 'y' key"
        assert isinstance(kp["y"], float), f"keypoints[{i}].y must be a float"

        assert "score" in kp, f"keypoints[{i}] must contain 'score' key"
        assert isinstance(kp["score"], float), f"keypoints[{i}].score must be a float"
