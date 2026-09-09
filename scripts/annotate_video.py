"""把 MoveNet 骨架叠加到视频上，用于调试关键点是否贴合人体。

示例：
    python scripts/annotate_video.py videos/pushup_side.mp4 -o out/pushup_side.mp4 \
        --sample-fps 10 --exercise 俯卧撑 \
        --angle left_shoulder,left_elbow,left_wrist \
        --angle left_hip,left_knee,left_ankle

脚本直接调用与线上一致的 `analyze_video_file`（同一后端、同一坐标映射），
因此画出来的骨架就是评分实际使用的关键点，可用于排查采集质量与识别偏差。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Sequence, Tuple


def _set_runtime_defaults() -> None:
    """允许在没有 .env 的环境下只跑姿态分析，不触碰数据库。"""

    os.environ.setdefault("ENVIRONMENT", "test")
    os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
    os.environ.setdefault(
        "SECRET_KEY",
        "annotate-video-secret-key-not-for-runtime-use-123456",
    )


def _parse_angles(values: Sequence[str]) -> List[Tuple[str, Tuple[str, str, str]]]:
    angles: List[Tuple[str, Tuple[str, str, str]]] = []
    for value in values:
        names = [name.strip() for name in value.split(",") if name.strip()]
        if len(names) != 3:
            raise SystemExit(f"--angle 需要三个关键点名称，收到：{value}")
        start, middle, end = names
        angles.append((middle, (start, middle, end)))
    return angles


def _resolve_rule(exercise: Optional[str]) -> Optional[Any]:
    if not exercise:
        return None
    from app.services.exercise_rules.registry import (
        find_rule_for_exercise,
        get_rule_by_exercise_type,
    )

    rule = get_rule_by_exercise_type(exercise)
    if rule is None:
        rule = find_rule_for_exercise(SimpleNamespace(name=exercise, standard=None))
    if rule is None:
        raise SystemExit(f"未找到动作规则：{exercise}")
    return rule


def annotate_video(
    video_path: Path,
    output_path: Path,
    *,
    sample_fps: Optional[int],
    angle_values: Sequence[str],
    exercise: Optional[str],
    show_names: bool,
    min_confidence: float,
    all_frames: bool,
    fourcc: str,
) -> Dict[str, Any]:
    _set_runtime_defaults()
    project_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(project_root))

    import cv2  # type: ignore

    from app.services.exercise_pose_scoring import score_pose_data
    from app.services.pose_overlay import (
        draw_pose_overlay,
        summarize_confidence,
    )
    from app.services.video_pose_analysis import analyze_video_file

    analysis = analyze_video_file(str(video_path), sample_fps=sample_fps)
    sampled_frames = analysis.get("frames") or []
    if not sampled_frames:
        raise SystemExit("分析结果没有采样帧，无法生成叠加视频")

    by_index = {int(frame["frame_index"]): frame for frame in sampled_frames}
    video_meta = analysis.get("video") or {}
    source_fps = float(video_meta.get("source_fps") or 0.0)
    used_sample_fps = int(video_meta.get("sample_fps") or sample_fps or 5)
    if source_fps <= 0:
        source_fps = float(used_sample_fps)
    sample_interval = max(1, int(round(source_fps / used_sample_fps)))
    output_fps = source_fps if all_frames else source_fps / sample_interval

    angle_labels = _parse_angles(angle_values)
    confidence_summary: Dict[str, Any] = {}
    for frame in sampled_frames:
        summary = summarize_confidence(frame.get("keypoints") or [])
        if not confidence_summary:
            confidence_summary = summary
        else:
            confidence_summary["count"] = (
                confidence_summary.get("count", 0) + summary["count"]
            )
            confidence_summary["minimum"] = min(
                confidence_summary.get("minimum", 1.0), summary["minimum"]
            )

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise SystemExit(f"无法打开视频：{video_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer: Any = None
    written = 0
    frame_index = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            sampled = by_index.get(frame_index)
            if sampled is not None:
                keypoints = sampled.get("keypoints") or []
                draw_pose_overlay(
                    frame,
                    keypoints,
                    min_confidence=min_confidence,
                    show_names=show_names,
                    angle_labels=angle_labels,
                    caption=(f"frame {frame_index}  t={sampled.get('timestamp_ms')}ms"),
                )
            if sampled is not None or all_frames:
                if writer is None:
                    height, width = frame.shape[:2]
                    writer = cv2.VideoWriter(
                        str(output_path),
                        cv2.VideoWriter_fourcc(*fourcc),
                        max(1.0, output_fps),
                        (width, height),
                    )
                    if not writer.isOpened():
                        raise SystemExit(
                            f"无法创建输出视频（编码器 {fourcc} 不可用）：{output_path}"
                        )
                writer.write(frame)
                written += 1
            frame_index += 1
    finally:
        cap.release()
        if writer is not None:
            writer.release()

    if writer is None or written == 0:
        raise SystemExit("没有写出任何帧，请检查采样参数")

    result: Dict[str, Any] = {
        "video": str(video_path),
        "output": str(output_path),
        "frames_read": frame_index,
        "frames_annotated": len(sampled_frames),
        "frames_written": written,
        "output_fps": round(output_fps, 3),
        "sample_fps": used_sample_fps,
        "confidence": confidence_summary,
        "model": analysis.get("model"),
    }

    rule = _resolve_rule(exercise)
    if rule is not None:
        scoring = score_pose_data(
            SimpleNamespace(name=rule.aliases[0], standard=None), analysis
        )
        metrics = scoring.get("metrics") or {}
        result["scoring"] = {
            "exercise_type": scoring.get("exercise_type"),
            "rule_version": (metrics.get("rule") or {}).get("rule_version"),
            "status": scoring.get("status"),
            "count": scoring.get("count"),
            "score": scoring.get("score"),
            "phases": metrics.get("phases"),
            "errors": [
                {"code": error.get("code"), "severity": error.get("severity")}
                for error in (metrics.get("errors") or [])
            ],
            "feedback": scoring.get("feedback"),
        }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", help="输入视频路径")
    parser.add_argument("-o", "--output", required=True, help="输出叠加视频路径")
    parser.add_argument(
        "--sample-fps", type=int, default=None, help="采样帧率（默认取配置值）"
    )
    parser.add_argument(
        "--angle",
        action="append",
        default=[],
        metavar="A,B,C",
        help="要标注的关节角，三个关键点名称，可重复",
    )
    parser.add_argument(
        "--exercise", default=None, help="动作名称或类型，用于打印评分摘要"
    )
    parser.add_argument("--show-names", action="store_true", help="标注关键点名称")
    parser.add_argument(
        "--min-confidence", type=float, default=0.3, help="低于该置信度的点不绘制"
    )
    parser.add_argument(
        "--all-frames", action="store_true", help="输出所有帧（仅采样帧带骨架）"
    )
    parser.add_argument("--fourcc", default="mp4v", help="输出编码，默认 mp4v")
    args = parser.parse_args()

    result = annotate_video(
        Path(args.video),
        Path(args.output),
        sample_fps=args.sample_fps,
        angle_values=args.angle,
        exercise=args.exercise,
        show_names=args.show_names,
        min_confidence=args.min_confidence,
        all_frames=args.all_frames,
        fourcc=args.fourcc,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
