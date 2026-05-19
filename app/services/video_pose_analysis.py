from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from app.config import settings
from app.schemas.exercise import MAX_KEYPOINTS_DATA_BYTES
from app.services.pose_analysis_runtime import (
    PoseAnalysisInferenceError,
    PoseAnalysisUnavailableError,
)
from app.services.pose_backends import registry
from app.services.pose_backends.protocol import PoseAnalysisBackend

POSE_ANALYSIS_SCHEMA_VERSION = 1
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
    if not cap.isOpened():
        raise PoseAnalysisInferenceError("无法打开视频文件进行姿态分析")

    pose_backend = backend or registry.get_backend()

    if not pose_backend.is_available():
        raise PoseAnalysisUnavailableError(
            f"Pose analysis backend '{pose_backend.backend_name}' is not available"
        )
    target_sample_fps = sample_fps or settings.POSE_ANALYSIS_SAMPLE_FPS
    source_fps = cap.get(cv2.CAP_PROP_FPS) or float(target_sample_fps)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    sample_interval = max(1, int(round(source_fps / target_sample_fps)))

    frames: List[Dict[str, Any]] = []
    confidence_values: List[float] = []
    frame_index = 0
    model_metadata: Dict[str, Any] = {}

    try:
        while len(frames) < MAX_STORED_SAMPLE_FRAMES:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_index % sample_interval == 0:
                frame_result = pose_backend.analyze_frame(frame)
                model_metadata = frame_result.get("model") or model_metadata
                keypoints = frame_result.get("keypoints", [])
                confidence_values.extend(
                    float(keypoint.get("score", 0)) for keypoint in keypoints
                )
                frames.append(
                    {
                        "frame_index": frame_index,
                        "timestamp_ms": int((frame_index / source_fps) * 1000),
                        "keypoints": keypoints,
                    }
                )

            frame_index += 1
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
        },
        "frames": frames,
    }
    return compact_pose_analysis_result(result)


def compact_pose_analysis_result(result: Dict[str, Any]) -> Dict[str, Any]:
    compacted = dict(result)
    frames = list(compacted.get("frames") or [])

    while _payload_size(compacted) > MAX_KEYPOINTS_DATA_BYTES and frames:
        frames = frames[::2]
        compacted["frames"] = frames
        summary = dict(compacted.get("summary") or {})
        summary["sampled_frames"] = len(frames)
        summary["valid_frame_count"] = len(frames)
        compacted["summary"] = summary

    if _payload_size(compacted) > MAX_KEYPOINTS_DATA_BYTES:
        raise PoseAnalysisInferenceError("姿态分析结果过大，无法保存")

    return compacted


def _payload_size(payload: Dict[str, Any]) -> int:
    return len(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )
