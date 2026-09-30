from __future__ import annotations

import json
import math
from typing import Any, Dict, List, Sequence

from app.config import settings
from app.schemas.exercise import MAX_KEYPOINTS_DATA_BYTES
from app.schemas.pose_analysis import POSE_ANALYSIS_SCHEMA_VERSION
from app.services.pose_analysis_runtime import (
    PoseAnalysisInferenceError,
    PoseAnalysisUnavailableError,
)
from app.services.pose_backends import registry
from app.services.pose_backends.protocol import PoseAnalysisBackend
from app.services.pose_keypoint_result import normalize_keypoint_result

MAX_STORED_SAMPLE_FRAMES = 120


def analyze_video_file(
    video_path: str,
    sample_fps: int | None = None,
    backend: PoseAnalysisBackend | None = None,
) -> Dict[str, Any]:
    try:
        import cv2  # type: ignore
    except ImportError as exc:
        raise PoseAnalysisUnavailableError(
            "OpenCV is required for video pose analysis"
        ) from exc

    cap = cv2.VideoCapture(video_path)
    frames: List[Dict[str, Any]] = []
    confidence_values: List[float] = []
    frame_index = 0
    model_metadata: Dict[str, Any] = {}

    try:
        if not cap.isOpened():
            raise PoseAnalysisInferenceError("无法打开视频文件进行姿态分析")
        pose_backend = backend or registry.get_backend()
        if not pose_backend.is_available():
            raise PoseAnalysisUnavailableError(
                f"Pose analysis backend '{pose_backend.backend_name}' is not available"
            )
        target_sample_fps = (
            sample_fps if sample_fps is not None else settings.POSE_ANALYSIS_SAMPLE_FPS
        )
        if not 1 <= target_sample_fps <= 30:
            raise PoseAnalysisInferenceError("采样帧率必须在 1 到 30 之间")
        source_fps = float(cap.get(cv2.CAP_PROP_FPS))
        if not math.isfinite(source_fps) or source_fps <= 0:
            raise PoseAnalysisInferenceError("视频帧率不可用，无法建立可靠时间轴")
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        sample_interval = max(1, int(round(source_fps / target_sample_fps)))

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_index % sample_interval == 0:
                if len(frames) >= MAX_STORED_SAMPLE_FRAMES:
                    raise PoseAnalysisInferenceError(
                        "视频超过 120 帧分析预算，请缩短视频或降低采样帧率"
                    )
                timestamp_ms = int((frame_index / source_fps) * 1000)
                try:
                    frame_result = normalize_keypoint_result(
                        pose_backend.analyze_frame(frame),
                        backend_name=pose_backend.backend_name,
                        timestamp_ms=timestamp_ms,
                    )
                except ValueError as exc:
                    raise PoseAnalysisInferenceError(
                        "Pose backend returned invalid keypoint result"
                    ) from exc
                model_metadata = frame_result.get("model") or model_metadata
                keypoints = frame_result.get("keypoints", [])
                confidence_values.extend(
                    float(keypoint.get("score", 0)) for keypoint in keypoints
                )
                frames.append(
                    {
                        "frame_index": frame_index,
                        "timestamp_ms": timestamp_ms,
                        "coordinate_space": frame_result["coordinate_space"],
                        "frame": frame_result["frame"],
                        "keypoints": keypoints,
                    }
                )

            frame_index += 1
        if total_frames > 0 and frame_index < total_frames:
            raise PoseAnalysisInferenceError("视频未完整解码，分析结果未保存")
    finally:
        cap.release()

    if not frames:
        raise PoseAnalysisInferenceError("视频中没有可分析的采样帧")

    average_confidence = (
        sum(confidence_values) / len(confidence_values) if confidence_values else 0
    )
    result = {
        "schema_version": POSE_ANALYSIS_SCHEMA_VERSION,
        "status": "done",
        "model": model_metadata,
        "summary": {
            "total_frames": total_frames,
            "processed_frames": frame_index,
            "sampled_frames": len(frames),
            "valid_frame_count": len(frames),
            "average_confidence": round(average_confidence, 6),
            "source_fps": round(float(source_fps), 3),
            "sample_fps": target_sample_fps,
            "requested_sample_fps": target_sample_fps,
            "coverage_status": "complete",
        },
        "frames": frames,
    }
    result["summary"]["sample_fps"] = round(source_fps / sample_interval, 6)
    return compact_pose_analysis_result(result)


def sampled_frame_stride(frame_indices: Sequence[int]) -> int:
    """采样帧之间的典型步长（中位数）；0 表示无法推断。

    用于回放历史抽稀结果；新分析保留全部采样帧。
    """

    ordered = sorted(int(index) for index in frame_indices)
    strides = sorted(
        later - earlier
        for earlier, later in zip(ordered, ordered[1:])
        if later > earlier
    )
    if not strides:
        return 0
    return strides[len(strides) // 2]


def compact_pose_analysis_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """Historical entry point: reject oversized evidence instead of thinning it."""
    if _payload_size(result) > MAX_KEYPOINTS_DATA_BYTES:
        raise PoseAnalysisInferenceError("姿态分析结果过大，请缩短视频或降低采样帧率")
    return dict(result)


def _payload_size(payload: Dict[str, Any]) -> int:
    return len(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )
