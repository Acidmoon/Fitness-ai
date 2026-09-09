from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from threading import RLock
from typing import Any, Callable, Dict, List, NamedTuple, Optional, Sequence, Tuple

from app.config import settings
from app.services.pose_keypoint_result import (
    STANDARD_KEYPOINT_NAMES,
    normalize_keypoint_result,
)

KEYPOINT_NAMES = list(STANDARD_KEYPOINT_NAMES)


class LetterboxTransform(NamedTuple):
    """MoveNet 方形输入与原始帧之间的映射参数。

    MoveNet 的输出坐标是相对“居中补零后的方形输入”归一化的，不是相对原始帧。
    非方形视频如果直接乘以原始宽高，几何形状会被各向异性拉伸（16:9 下竖轴被压到
    H/W），关节角随之系统性偏移，因此必须用这里的参数反解回原始像素。
    """

    input_size: int
    scale: float
    x_offset: int
    y_offset: int

    def to_frame_pixels(self, x_norm: float, y_norm: float) -> Tuple[float, float]:
        """把方形输入内的归一化坐标还原为原始帧像素坐标。

        落在补零区域的坐标会还原到画面之外（负值或超出宽高），这是真实情况，
        不做裁剪，让调用方按置信度自行判断。
        """

        x = (x_norm * self.input_size - self.x_offset) / self.scale
        y = (y_norm * self.input_size - self.y_offset) / self.scale
        return x, y


def letterbox_transform(
    frame_width: int,
    frame_height: int,
    input_size: int,
) -> LetterboxTransform:
    """计算与 `_preprocess_frame` 完全一致的 letterbox 参数。"""

    scale = min(input_size / frame_height, input_size / frame_width)
    new_width = int(frame_width * scale)
    new_height = int(frame_height * scale)
    return LetterboxTransform(
        input_size=input_size,
        scale=scale,
        x_offset=(input_size - new_width) // 2,
        y_offset=(input_size - new_height) // 2,
    )


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
    *,
    transform: LetterboxTransform,
) -> List[Dict[str, float | str]]:
    keypoints = _extract_keypoint_rows(keypoints_with_scores)
    if len(keypoints) != len(KEYPOINT_NAMES):
        raise PoseAnalysisInferenceError("MoveNet output must contain 17 keypoints")

    normalized: List[Dict[str, float | str]] = []
    for index, row in enumerate(keypoints):
        y_norm = float(row[0])
        x_norm = float(row[1])
        score = float(row[2])
        x_px, y_px = transform.to_frame_pixels(x_norm, y_norm)
        normalized.append(
            {
                "name": KEYPOINT_NAMES[index],
                "x": round(x_px, 3),
                "y": round(y_px, 3),
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
                input_tensor, transform = self._preprocess_frame(frame_bgr)
                self._interpreter.set_tensor(
                    self._input_details[0]["index"], input_tensor
                )
                self._interpreter.invoke()
                raw_keypoints = self._interpreter.get_tensor(
                    self._output_details[0]["index"]
                )

            raw_result = {
                "model": {
                    "backend": "movenet",
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
                    transform=transform,
                ),
            }
            normalized_result = normalize_keypoint_result(
                raw_result,
                backend_name="movenet",
                frame_width=frame_width,
                frame_height=frame_height,
            )
            normalized_result["confidence_threshold"] = self.config.min_confidence
            return normalized_result
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
        _validate_model_io_dtypes(input_details, output_details, self._np)

    def _preprocess_frame(self, frame_bgr: Any) -> Tuple[Any, LetterboxTransform]:
        frame_rgb = self._cv2.cvtColor(frame_bgr, self._cv2.COLOR_BGR2RGB)
        frame_height, frame_width = _frame_dimensions(frame_rgb)
        input_size = self._input_size or 256

        transform = letterbox_transform(frame_width, frame_height, input_size)
        scale = transform.scale
        new_height = int(frame_height * scale)
        new_width = int(frame_width * scale)
        resized_image = self._cv2.resize(frame_rgb, (new_width, new_height))

        padded_image = self._np.zeros(
            (input_size, input_size, 3), dtype=frame_rgb.dtype
        )
        padded_image[
            transform.y_offset : transform.y_offset + new_height,
            transform.x_offset : transform.x_offset + new_width,
        ] = resized_image

        input_tensor = self._np.expand_dims(padded_image, axis=0)
        input_dtype = self._input_details[0]["dtype"]
        if input_dtype == self._np.uint8:
            return self._np.clip(input_tensor, 0, 255).astype(self._np.uint8), transform
        if input_dtype == self._np.float32:
            return input_tensor.astype(self._np.float32), transform
        return input_tensor.astype(input_dtype), transform


def _input_size_from_details(input_details: Any) -> int:
    input_shape = input_details[0]["shape"]
    if len(input_shape) != 4:
        raise PoseAnalysisUnavailableError("MoveNet model input shape is invalid")
    return int(input_shape[1])


def _is_integer_dtype(dtype: Any, numpy_module: Any) -> bool:
    """True for quantized dtypes; test doubles may pass a non-numpy sentinel."""
    try:
        return bool(
            numpy_module.issubdtype(dtype, numpy_module.integer)
            or numpy_module.issubdtype(dtype, numpy_module.unsignedinteger)
        )
    except TypeError:
        return False


def _validate_model_io_dtypes(
    input_details: Any, output_details: Any, numpy_module: Any
) -> None:
    """拒绝无法解码的量化模型，否则关键点是静默错误的垃圾数据。

    全量化（int8）MoveNet 输出的坐标是量化整数，需要 scale/zero_point 反量化；
    本运行时只做 float 输出解析，因此必须在加载阶段报错而不是返回错误姿态。
    """
    if numpy_module is None or not output_details:
        return
    if not hasattr(numpy_module, "issubdtype"):
        # 测试替身可以传入不提供 numpy dtype 机制的假模块。
        return

    output_dtype = output_details[0].get("dtype")
    input_dtype = input_details[0].get("dtype") if input_details else None
    quantized_output = _is_integer_dtype(output_dtype, numpy_module)
    # uint8 输入有显式支持路径，签名字节输入（int8）没有量化处理，同样不可用。
    signed_int_input = (
        input_dtype is not None
        and bool(_is_integer_dtype(input_dtype, numpy_module))
        and not (input_dtype == getattr(numpy_module, "uint8", None))
    )

    if quantized_output or signed_int_input:
        raise PoseAnalysisUnavailableError(
            "当前 MoveNet 模型是 int8 量化版本，运行时不做反量化，会产出错误关键点；"
            "请改用 float16/float32 模型并设置 MOVENET_MODEL_PATH"
        )


def _frame_dimensions(frame: Any) -> Tuple[int, int]:
    shape = getattr(frame, "shape", None)
    if not shape or len(shape) < 2:
        raise PoseAnalysisInferenceError("Frame must expose image dimensions")
    return int(shape[0]), int(shape[1])
