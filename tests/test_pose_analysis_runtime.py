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


def test_runtime_analyze_frame_returns_canonical_keypoint_result(tmp_path):
    model_path = tmp_path / "model.tflite"
    model_path.write_bytes(b"fake")

    class FakeInterpreter:
        def allocate_tensors(self):
            return None

        def get_input_details(self):
            return [{"shape": [1, 192, 192, 3], "index": 0, "dtype": object}]

        def get_output_details(self):
            return [{"index": 1}]

        def set_tensor(self, _index, _value):
            return None

        def invoke(self):
            return None

        def get_tensor(self, _index):
            return [[[[0.1, 0.2, 0.9] for _ in range(17)]]]

    class FakeCv2:
        COLOR_BGR2RGB = 1

        def cvtColor(self, frame, _mode):
            return frame

        def resize(self, frame, _size):
            return frame

    class FakeNp:
        uint8 = "uint8"
        float32 = "float32"

        def zeros(self, shape, dtype=None):
            return FakeFrame(shape, dtype=dtype)

        def expand_dims(self, value, axis=0):
            return value

        def clip(self, value, _min, _max):
            return value

    class FakeFrame:
        def __init__(self, shape=(480, 640, 3), dtype="uint8"):
            self.shape = shape
            self.dtype = dtype

        def astype(self, _dtype):
            return self

        def __setitem__(self, _key, _value):
            return None

    pose_runtime = MoveNetRuntime(
        config=enabled_config(str(model_path)),
        interpreter_factory=lambda _model_path: FakeInterpreter(),
        cv2_module=FakeCv2(),
        numpy_module=FakeNp(),
    )

    result = pose_runtime.analyze_frame(FakeFrame())

    assert result["schema_version"] == 1
    assert result["coordinate_space"] == "image_pixels"
    assert result["model"]["backend"] == "movenet"
    assert result["model"]["name"] == "thunder"
    assert result["frame"] == {"width": 640, "height": 480}
    assert len(result["keypoints"]) == 17


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
