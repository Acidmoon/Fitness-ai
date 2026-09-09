"""调试用的姿态骨架叠加绘制。

MoveNet 只输出 17 个关键点坐标，画骨架是消费端的事：这里用 OpenCV 把 COCO 骨架、
置信度配色、关节角与阶段文字画到原始帧上，用于本地排查“关键点是否贴合人体”。
生产接口不依赖本模块，它只服务于 `scripts/annotate_video.py` 与测试。
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from app.services.pose_features import calculate_joint_angle

# COCO-17 骨架连线，与 STANDARD_KEYPOINT_NAMES 对齐。
COCO_SKELETON_EDGES: Tuple[Tuple[str, str], ...] = (
    ("nose", "left_eye"),
    ("nose", "right_eye"),
    ("left_eye", "left_ear"),
    ("right_eye", "right_ear"),
    ("left_shoulder", "right_shoulder"),
    ("left_shoulder", "left_elbow"),
    ("left_elbow", "left_wrist"),
    ("right_shoulder", "right_elbow"),
    ("right_elbow", "right_wrist"),
    ("left_shoulder", "left_hip"),
    ("right_shoulder", "right_hip"),
    ("left_hip", "right_hip"),
    ("left_hip", "left_knee"),
    ("left_knee", "left_ankle"),
    ("right_hip", "right_knee"),
    ("right_knee", "right_ankle"),
)

# 置信度分档配色（BGR）。
HIGH_CONFIDENCE_COLOR = (0, 200, 0)
MID_CONFIDENCE_COLOR = (0, 200, 255)
LOW_CONFIDENCE_COLOR = (0, 0, 255)
TEXT_COLOR = (255, 255, 255)
TEXT_BACKGROUND = (0, 0, 0)

HIGH_CONFIDENCE_THRESHOLD = 0.5
MID_CONFIDENCE_THRESHOLD = 0.3


def _resolve_cv2(cv2_module: Any = None) -> Any:
    if cv2_module is not None:
        return cv2_module
    try:
        import cv2  # type: ignore
    except ImportError as exc:  # pragma: no cover - 依赖缺失时的显式报错
        raise RuntimeError(
            "OpenCV is required for pose overlay drawing; install opencv-python-headless"
        ) from exc
    return cv2


def confidence_color(score: float) -> Tuple[int, int, int]:
    """按置信度返回 BGR 颜色，便于一眼看出哪些点不可信。"""

    if score >= HIGH_CONFIDENCE_THRESHOLD:
        return HIGH_CONFIDENCE_COLOR
    if score >= MID_CONFIDENCE_THRESHOLD:
        return MID_CONFIDENCE_COLOR
    return LOW_CONFIDENCE_COLOR


def draw_pose_overlay(
    frame: Any,
    keypoints: Sequence[Mapping[str, Any]],
    *,
    cv2_module: Any = None,
    min_confidence: float = MID_CONFIDENCE_THRESHOLD,
    show_names: bool = False,
    angle_labels: Iterable[Tuple[str, Tuple[str, str, str]]] = (),
    caption: Optional[str] = None,
    joint_radius: int = 3,
    line_thickness: int = 2,
) -> Any:
    """在 `frame` 上原地绘制骨架并返回同一个对象。

    低于 `min_confidence` 的关键点既不画点也不画连线，避免用不可信坐标误导肉眼判断。
    `angle_labels` 是 (标签, (起点, 顶点, 终点)) 序列，会在顶点旁标注计算出的角度。
    """

    cv2 = _resolve_cv2(cv2_module)
    points = {
        str(keypoint.get("name")): keypoint
        for keypoint in keypoints
        if _is_drawable(keypoint, min_confidence)
    }

    for start_name, end_name in COCO_SKELETON_EDGES:
        start = points.get(start_name)
        end = points.get(end_name)
        if start is None or end is None:
            continue
        color = confidence_color(
            min(float(start.get("score", 0.0)), float(end.get("score", 0.0)))
        )
        cv2.line(
            frame,
            _as_pixel(start),
            _as_pixel(end),
            color,
            line_thickness,
            cv2.LINE_AA,
        )

    for name, keypoint in points.items():
        cv2.circle(
            frame,
            _as_pixel(keypoint),
            joint_radius,
            confidence_color(float(keypoint.get("score", 0.0))),
            -1,
            cv2.LINE_AA,
        )
        if show_names:
            _draw_text(
                cv2,
                frame,
                name,
                (_as_pixel(keypoint)[0] + 4, _as_pixel(keypoint)[1] - 4),
                scale=0.4,
            )

    for label, triplet in angle_labels:
        start_name, middle_name, end_name = triplet
        if not all(name in points for name in triplet):
            continue
        angle = calculate_joint_angle(
            {name: points[name] for name in triplet}, start_name, middle_name, end_name
        )
        middle = _as_pixel(points[middle_name])
        _draw_text(
            cv2,
            frame,
            f"{label} {angle:.0f}",
            (middle[0] + 6, middle[1] + 6),
            scale=0.5,
        )

    if caption:
        _draw_text(cv2, frame, caption, (10, 24), scale=0.6)

    return frame


def draw_frame_caption(
    frame: Any,
    caption: str,
    *,
    cv2_module: Any = None,
    origin: Tuple[int, int] = (10, 24),
    scale: float = 0.6,
) -> Any:
    """只画一行说明文字（帧号、时间戳、阶段等）。"""

    _draw_text(_resolve_cv2(cv2_module), frame, caption, origin, scale=scale)
    return frame


def _is_drawable(keypoint: Mapping[str, Any], min_confidence: float) -> bool:
    if not isinstance(keypoint, Mapping):
        return False
    try:
        score = float(keypoint.get("score", 0.0))
        float(keypoint.get("x"))
        float(keypoint.get("y"))
    except (TypeError, ValueError):
        return False
    return score >= min_confidence


def _as_pixel(keypoint: Mapping[str, Any]) -> Tuple[int, int]:
    return int(round(float(keypoint["x"]))), int(round(float(keypoint["y"])))


def _draw_text(
    cv2: Any,
    frame: Any,
    text: str,
    origin: Tuple[int, int],
    *,
    scale: float = 0.5,
) -> None:
    font = cv2.FONT_HERSHEY_SIMPLEX
    thickness = 1
    (text_width, text_height), baseline = cv2.getTextSize(text, font, scale, thickness)
    x, y = origin
    cv2.rectangle(
        frame,
        (x - 2, y - text_height - 2),
        (x + text_width + 2, y + baseline + 2),
        TEXT_BACKGROUND,
        -1,
    )
    cv2.putText(frame, text, (x, y), font, scale, TEXT_COLOR, thickness, cv2.LINE_AA)


def summarize_confidence(keypoints: Sequence[Mapping[str, Any]]) -> Dict[str, float]:
    """给调试脚本用的置信度概览。"""

    scores: List[float] = [
        float(keypoint.get("score", 0.0))
        for keypoint in keypoints
        if isinstance(keypoint, Mapping) and keypoint.get("score") is not None
    ]
    if not scores:
        return {"count": 0, "average": 0.0, "minimum": 0.0, "below_threshold": 0.0}
    return {
        "count": len(scores),
        "average": round(sum(scores) / len(scores), 4),
        "minimum": round(min(scores), 4),
        "below_threshold": float(
            sum(1 for score in scores if score < MID_CONFIDENCE_THRESHOLD)
        ),
    }


def write_annotated_video(
    video_path: Any,
    output_path: Any,
    analysis: Mapping[str, Any],
    *,
    cv2_module: Any = None,
    min_confidence: float = MID_CONFIDENCE_THRESHOLD,
    show_names: bool = False,
    angle_labels: Iterable[Tuple[str, Tuple[str, str, str]]] = (),
    all_frames: bool = False,
    fourcc: str = "mp4v",
    output_fps: Optional[float] = None,
) -> Dict[str, Any]:
    """把分析结果里的关键点骨架写回视频，返回写出统计。

    `all_frames=False` 时只写出采样帧（文件小、播放即逐次重复）；
    为 True 时写出每一帧，但只有采样帧带骨架。
    """

    cv2 = _resolve_cv2(cv2_module)
    sampled_frames = list(analysis.get("frames") or [])
    if not sampled_frames:
        raise ValueError("分析结果没有采样帧，无法生成叠加视频")

    by_index = {int(frame["frame_index"]): frame for frame in sampled_frames}
    video_meta = analysis.get("video") or {}
    source_fps = float(video_meta.get("source_fps") or 0.0)
    sample_fps = float(video_meta.get("sample_fps") or 0.0) or 5.0
    if source_fps <= 0:
        source_fps = sample_fps
    sample_interval = max(1, int(round(source_fps / sample_fps)))
    target_fps = output_fps or (
        source_fps if all_frames else source_fps / sample_interval
    )

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise ValueError(f"无法打开视频：{video_path}")

    output_path = str(output_path)
    writer: Any = None
    written = 0
    frame_index = 0
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            sampled = by_index.get(frame_index)
            if sampled is not None:
                draw_pose_overlay(
                    frame,
                    sampled.get("keypoints") or [],
                    cv2_module=cv2,
                    min_confidence=min_confidence,
                    show_names=show_names,
                    angle_labels=angle_labels,
                    caption=f"frame {frame_index}  t={sampled.get('timestamp_ms')}ms",
                )
            if sampled is not None or all_frames:
                if writer is None:
                    height, width = frame.shape[:2]
                    writer = cv2.VideoWriter(
                        output_path,
                        cv2.VideoWriter_fourcc(*fourcc),
                        max(1.0, float(target_fps)),
                        (width, height),
                    )
                    if not writer.isOpened():
                        raise ValueError(
                            f"无法创建输出视频（编码器 {fourcc} 不可用）：{output_path}"
                        )
                writer.write(frame)
                written += 1
            frame_index += 1
    finally:
        capture.release()
        if writer is not None:
            writer.release()

    if written == 0:
        raise ValueError("没有写出任何帧，请检查采样参数")

    return {
        "frames_read": frame_index,
        "frames_annotated": len(sampled_frames),
        "frames_written": written,
        "output_fps": round(float(target_fps), 3),
        "sample_fps": int(sample_fps),
    }
