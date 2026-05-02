from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from threading import RLock
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from app.config import settings

KEYPOINT_NAMES = [
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


class PoseAnalysisRuntimeError(Exception):
    """Base error for MoveNet runtime failures."""


class PoseAnalysisDisabledError(PoseAnalysisRuntimeError):
    """Raised when pose analysis is disabled by configuration."""


class PoseAnalysisUnavailableError(PoseAnalysisRuntimeError):
    """Raised when model files or optional native dependencies are unavailable."""


class PoseAnalysisInferenceError(PoseAnalysisRuntimeError):
    """Raised when model invocation fails."""


@dataclass(frozen=True)
class PoseRuntimeConfig:
    enabled: bool
    model_path: str
    model_variant: str
    min_confidence: float
    sample_fps: int

    @classmethod
    def from_settings(cls, settings_obj=settings) -> "PoseRuntimeConfig":
        return cls(
            enabled=bool(settings_obj.MOVENET_ENABLED),
            model_path=settings_obj.MOVENET_MODEL_PATH.strip(),
            model_variant=settings_obj.MOVENET_MODEL_VARIANT,
            min_confidence=settings_obj.MOVENET_MIN_CONFIDENCE,
            sample_fps=settings_obj.MOVENET_SAMPLE_FPS,
        )


def resolve_movenet_model_path(config: PoseRuntimeConfig) -> Path:
    if not config.enabled:
        raise PoseAnalysisDisabledError("MoveNet pose analysis is disabled")

    if not config.model_path:
        raise PoseAnalysisUnavailableError("MOVENET_MODEL_PATH is not configured")

    model_path = Path(config.model_path).expanduser()
    if model_path.suffix.lower() != ".tflite":
        raise PoseAnalysisUnavailableError(
            "MoveNet model path must point to a .tflite file"
        )

    if not model_path.is_file():
        raise PoseAnalysisUnavailableError("MoveNet model file does not exist")

    return model_path


def normalize_keypoints(
    keypoints_with_scores: Any,
    frame_width: int,
    frame_height: int,
) -> List[Dict[str, float | str]]:
    keypoints = _extract_keypoint_rows(keypoints_with_scores)
    if len(keypoints) != len(KEYPOINT_NAMES):
        raise PoseAnalysisInferenceError("MoveNet output must contain 17 keypoints")

    normalized: List[Dict[str, float | str]] = []
    for index, row in enumerate(keypoints):
        y_norm = float(row[0])
        x_norm = float(row[1])
        score = float(row[2])
        normalized.append(
            {
                "name": KEYPOINT_NAMES[index],
                "x": round(x_norm * frame_width, 3),
                "y": round(y_norm * frame_height, 3),
                "score": round(score, 6),
            }
        )
    return normalized


def _extract_keypoint_rows(keypoints_with_scores: Any) -> Sequence[Sequence[float]]:
    if hasattr(keypoints_with_scores, "tolist"):
        keypoints_with_scores = keypoints_with_scores.tolist()

    data = keypoints_with_scores
    while isinstance(data, list) and len(data) == 1:
        data = data[0]

    if not isinstance(data, list):
        raise PoseAnalysisInferenceError("MoveNet output format is invalid")

    return data


def _load_optional_dependencies() -> Tuple[Any, Any, Callable[[str], Any]]:
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except ImportError as exc:
        raise PoseAnalysisUnavailableError(
            "OpenCV and NumPy are required for MoveNet pose analysis"
        ) from exc

    try:
        from tflite_runtime.interpreter import Interpreter  # type: ignore
    except ImportError:
        try:
            from ai_edge_litert.interpreter import Interpreter  # type: ignore
        except ImportError:
            try:
                from tensorflow.lite import Interpreter  # type: ignore
            except ImportError as exc:
                raise PoseAnalysisUnavailableError(
                    "A TensorFlow Lite interpreter is required for MoveNet pose analysis"
                ) from exc

    return cv2, np, Interpreter


class MoveNetRuntime:
    def __init__(
        self,
        config: Optional[PoseRuntimeConfig] = None,
        interpreter_factory: Optional[Callable[[str], Any]] = None,
        cv2_module: Any = None,
        numpy_module: Any = None,
    ) -> None:
        self.config = config or PoseRuntimeConfig.from_settings()
        self._interpreter_factory = interpreter_factory
        self._cv2 = cv2_module
        self._np = numpy_module
        self._interpreter: Any = None
        self._input_details: Any = None
        self._output_details: Any = None
        self._input_size: Optional[int] = None
        self._lock = RLock()

    def analyze_frame(self, frame_bgr: Any) -> Dict[str, Any]:
        try:
            with self._lock:
                self._ensure_loaded()
                frame_height, frame_width = _frame_dimensions(frame_bgr)
                input_tensor = self._preprocess_frame(frame_bgr)
                self._interpreter.set_tensor(
                    self._input_details[0]["index"], input_tensor
                )
                self._interpreter.invoke()
                raw_keypoints = self._interpreter.get_tensor(
                    self._output_details[0]["index"]
                )

            return {
                "model": {
                    "name": self.config.model_variant,
                    "input_size": self._input_size,
                },
                "frame": {
                    "width": frame_width,
                    "height": frame_height,
                },
                "confidence_threshold": self.config.min_confidence,
                "keypoints": normalize_keypoints(
                    raw_keypoints,
                    frame_width=frame_width,
                    frame_height=frame_height,
                ),
            }
        except PoseAnalysisRuntimeError:
            raise
        except Exception as exc:
            raise PoseAnalysisInferenceError("MoveNet inference failed") from exc

    def _ensure_loaded(self) -> None:
        if self._interpreter is not None:
            return

        model_path = resolve_movenet_model_path(self.config)
        if self._interpreter_factory is None or self._cv2 is None or self._np is None:
            cv2_module, np_module, interpreter_factory = _load_optional_dependencies()
            self._cv2 = self._cv2 or cv2_module
            self._np = self._np or np_module
            self._interpreter_factory = self._interpreter_factory or interpreter_factory

        interpreter = self._interpreter_factory(str(model_path))
        interpreter.allocate_tensors()
        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()

        self._interpreter = interpreter
        self._input_details = input_details
        self._output_details = output_details
        self._input_size = _input_size_from_details(input_details)

    def _preprocess_frame(self, frame_bgr: Any) -> Any:
        frame_rgb = self._cv2.cvtColor(frame_bgr, self._cv2.COLOR_BGR2RGB)
        frame_height, frame_width = _frame_dimensions(frame_rgb)
        input_size = self._input_size or 256

        scale = min(input_size / frame_height, input_size / frame_width)
        new_height = int(frame_height * scale)
        new_width = int(frame_width * scale)
        resized_image = self._cv2.resize(frame_rgb, (new_width, new_height))

        padded_image = self._np.zeros(
            (input_size, input_size, 3), dtype=frame_rgb.dtype
        )
        y_offset = (input_size - new_height) // 2
        x_offset = (input_size - new_width) // 2
        padded_image[
            y_offset : y_offset + new_height,
            x_offset : x_offset + new_width,
        ] = resized_image

        input_tensor = self._np.expand_dims(padded_image, axis=0)
        input_dtype = self._input_details[0]["dtype"]
        if input_dtype == self._np.uint8:
            return self._np.clip(input_tensor, 0, 255).astype(self._np.uint8)
        if input_dtype == self._np.float32:
            return input_tensor.astype(self._np.float32)
        return input_tensor.astype(input_dtype)


def _input_size_from_details(input_details: Any) -> int:
    input_shape = input_details[0]["shape"]
    if len(input_shape) != 4:
        raise PoseAnalysisUnavailableError("MoveNet model input shape is invalid")
    return int(input_shape[1])


def _frame_dimensions(frame: Any) -> Tuple[int, int]:
    shape = getattr(frame, "shape", None)
    if not shape or len(shape) < 2:
        raise PoseAnalysisInferenceError("Frame must expose image dimensions")
    return int(shape[0]), int(shape[1])
