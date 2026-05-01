import pytest

from app.services import pose_analysis_runtime as runtime
from app.services.pose_analysis_runtime import (
    MoveNetRuntime,
    PoseAnalysisDisabledError,
    PoseAnalysisInferenceError,
    PoseAnalysisUnavailableError,
    PoseRuntimeConfig,
    normalize_keypoints,
    resolve_movenet_model_path,
)


def enabled_config(model_path: str) -> PoseRuntimeConfig:
    return PoseRuntimeConfig(
        enabled=True,
        model_path=model_path,
        model_variant="thunder",
        min_confidence=0.3,
        sample_fps=5,
    )


def test_resolve_movenet_model_path_disabled():
    config = PoseRuntimeConfig(
        enabled=False,
        model_path="model.tflite",
        model_variant="thunder",
        min_confidence=0.3,
        sample_fps=5,
    )

    with pytest.raises(PoseAnalysisDisabledError):
        resolve_movenet_model_path(config)


def test_resolve_movenet_model_path_requires_configured_file(tmp_path):
    with pytest.raises(PoseAnalysisUnavailableError):
        resolve_movenet_model_path(enabled_config(""))

    with pytest.raises(PoseAnalysisUnavailableError):
        resolve_movenet_model_path(enabled_config(str(tmp_path / "model.txt")))

    with pytest.raises(PoseAnalysisUnavailableError):
        resolve_movenet_model_path(enabled_config(str(tmp_path / "missing.tflite")))


def test_resolve_movenet_model_path_accepts_existing_tflite_file(tmp_path):
    model_path = tmp_path / "model.tflite"
    model_path.write_bytes(b"fake")

    assert resolve_movenet_model_path(enabled_config(str(model_path))) == model_path


def test_normalize_keypoints_retains_low_confidence_values():
    raw_keypoints = [
        [
            [
                [index / 100, index / 200, 0.05 if index == 0 else 0.9]
                for index in range(17)
            ]
        ]
    ]

    result = normalize_keypoints(raw_keypoints, frame_width=640, frame_height=480)

    assert len(result) == 17
    assert result[0] == {"name": "nose", "x": 0.0, "y": 0.0, "score": 0.05}
    assert result[5]["name"] == "left_shoulder"
    assert result[5]["x"] == 16.0
    assert result[5]["y"] == 24.0
    assert result[5]["score"] == 0.9


def test_normalize_keypoints_rejects_invalid_keypoint_count():
    with pytest.raises(PoseAnalysisInferenceError):
        normalize_keypoints([[[[0, 0, 1]]]], frame_width=640, frame_height=480)


def test_runtime_reports_dependency_unavailable(tmp_path, monkeypatch):
    model_path = tmp_path / "model.tflite"
    model_path.write_bytes(b"fake")

    def missing_dependencies():
        raise PoseAnalysisUnavailableError("missing deps")

    monkeypatch.setattr(runtime, "_load_optional_dependencies", missing_dependencies)
    pose_runtime = MoveNetRuntime(config=enabled_config(str(model_path)))

    with pytest.raises(PoseAnalysisUnavailableError):
        pose_runtime._ensure_loaded()


def test_runtime_caches_interpreter_per_process(tmp_path):
    model_path = tmp_path / "model.tflite"
    model_path.write_bytes(b"fake")
    calls = {"count": 0}

    class FakeInterpreter:
        def allocate_tensors(self):
            return None

        def get_input_details(self):
            return [{"shape": [1, 192, 192, 3], "index": 0, "dtype": object}]

        def get_output_details(self):
            return [{"index": 1}]

    def factory(_model_path):
        calls["count"] += 1
        return FakeInterpreter()

    pose_runtime = MoveNetRuntime(
        config=enabled_config(str(model_path)),
        interpreter_factory=factory,
        cv2_module=object(),
        numpy_module=object(),
    )

    pose_runtime._ensure_loaded()
    pose_runtime._ensure_loaded()

    assert calls["count"] == 1
    assert pose_runtime._input_size == 192
