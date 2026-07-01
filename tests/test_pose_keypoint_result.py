import pytest

from app.services.pose_keypoint_result import normalize_keypoint_result


def test_normalize_keypoint_result_adds_canonical_metadata():
    result = normalize_keypoint_result(
        {
            "model": {"name": "pose-model", "input_size": "256"},
            "keypoints": [{"name": "nose", "x": 1, "y": "2.5", "score": "0.9"}],
        },
        backend_name="test-backend",
        frame_width=640,
        frame_height=480,
        timestamp_ms=120,
    )

    assert result == {
        "schema_version": 1,
        "model": {
            "backend": "test-backend",
            "name": "pose-model",
            "input_size": 256,
        },
        "frame": {"width": 640, "height": 480, "timestamp_ms": 120},
        "coordinate_space": "image_pixels",
        "keypoints": [{"name": "nose", "x": 1.0, "y": 2.5, "score": 0.9}],
    }


def test_normalize_keypoint_result_rejects_unknown_keypoints():
    with pytest.raises(ValueError, match="standard keypoint"):
        normalize_keypoint_result(
            {
                "model": {"name": "pose-model"},
                "keypoints": [{"name": "tail", "x": 1, "y": 2, "score": 0.9}],
            },
            backend_name="test-backend",
        )


def test_normalize_keypoint_result_rejects_duplicate_keypoints():
    with pytest.raises(ValueError, match="Duplicate keypoint"):
        normalize_keypoint_result(
            {
                "model": {"name": "pose-model"},
                "keypoints": [
                    {"name": "nose", "x": 1, "y": 2, "score": 0.9},
                    {"name": "nose", "x": 3, "y": 4, "score": 0.8},
                ],
            },
            backend_name="test-backend",
        )


def test_normalize_keypoint_result_rejects_out_of_range_score():
    with pytest.raises(ValueError, match="between 0 and 1"):
        normalize_keypoint_result(
            {
                "model": {"name": "pose-model"},
                "keypoints": [{"name": "nose", "x": 1, "y": 2, "score": 1.2}],
            },
            backend_name="test-backend",
        )
