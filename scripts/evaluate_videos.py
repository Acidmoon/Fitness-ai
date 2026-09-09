"""批量评估真实样例视频，输出次数误差、错误判据与相位指标报告。

用法：
    python scripts/evaluate_videos.py videos/ --manifest videos/manifest.csv \
        --output reports/eval-2026-09-08 --annotate

清单格式见 `docs/视频评估与标注指南.md`；`--annotate` 会同时输出骨架叠加视频，
便于逐条回看失败案例。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Sequence

TOOL_VERSION = "cv_evaluation_v1"


def _set_runtime_defaults() -> None:
    os.environ.setdefault("ENVIRONMENT", "test")
    os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
    os.environ.setdefault(
        "SECRET_KEY",
        "evaluate-videos-secret-key-not-for-runtime-use-123456",
    )


def _resolve_rule(exercise: str) -> Optional[Any]:
    from app.services.exercise_rules.registry import (
        find_rule_for_exercise,
        get_rule_by_exercise_type,
    )

    rule = get_rule_by_exercise_type(exercise)
    if rule is None:
        rule = find_rule_for_exercise(SimpleNamespace(name=exercise, standard=None))
    return rule


def evaluate_videos(
    videos_dir: Path,
    manifest_path: Path,
    output_dir: Path,
    *,
    sample_fps: Optional[int] = None,
    annotate: bool = False,
    exercise_filter: Optional[Sequence[str]] = None,
    annotate_min_confidence: float = 0.3,
) -> Dict[str, Any]:
    _set_runtime_defaults()
    project_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(project_root))

    from app.services.cv_evaluation import (
        evaluate_sample,
        load_manifest,
        render_markdown,
        summarize_results,
    )
    from app.services.video_pose_analysis import analyze_video_file

    samples = load_manifest(manifest_path)
    if exercise_filter:
        allowed = {value.strip().lower() for value in exercise_filter}
        samples = [sample for sample in samples if sample.exercise.lower() in allowed]

    annotated_dir = output_dir / "annotated"
    if annotate:
        annotated_dir.mkdir(parents=True, exist_ok=True)

    rows: List[Dict[str, Any]] = []
    for sample in samples:
        video_path = Path(sample.file)
        if not video_path.is_absolute():
            video_path = videos_dir / sample.file
        rule = _resolve_rule(sample.exercise)
        if rule is None:
            rows.append(evaluate_sample(sample, rule=None))
            continue
        if not video_path.is_file():
            rows.append(
                evaluate_sample(
                    sample, rule=rule, analysis=None, error="视频文件不存在"
                )
            )
            continue
        try:
            analysis = analyze_video_file(
                str(video_path), sample_fps=sample.sample_fps or sample_fps
            )
        except Exception as exc:  # 单条失败不能中断整批评估
            rows.append(
                evaluate_sample(
                    sample,
                    rule=rule,
                    analysis=None,
                    error=f"{type(exc).__name__}: {exc}",
                )
            )
            continue

        row = evaluate_sample(sample, rule=rule, analysis=analysis)
        rows.append(row)

        if annotate:
            from app.services.pose_overlay import write_annotated_video

            try:
                stats = write_annotated_video(
                    video_path,
                    annotated_dir / f"{video_path.stem}.mp4",
                    analysis,
                    min_confidence=annotate_min_confidence,
                )
                row["annotated"] = stats["frames_written"]
            except Exception as exc:
                row["annotated_error"] = f"{type(exc).__name__}: {exc}"

    summary = summarize_results(rows)
    scored_rows = [row for row in rows if row.get("scored")]
    report: Dict[str, Any] = {
        "tool_version": TOOL_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "videos_dir": str(videos_dir),
        "manifest": str(manifest_path),
        "model": scored_rows[0].get("model") if scored_rows else None,
        "schema_version": scored_rows[0].get("schema_version") if scored_rows else None,
        "rule_versions": sorted(
            {row["rule_version"] for row in scored_rows if row.get("rule_version")}
        ),
        "summary": summary,
        "samples": rows,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    report_json = output_dir / "report.json"
    report_md = output_dir / "report.md"
    report_json.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    report_md.write_text(render_markdown(report), encoding="utf-8")
    report["report_json"] = str(report_json)
    report["report_markdown"] = str(report_md)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("videos_dir", help="视频所在目录")
    parser.add_argument(
        "--manifest",
        default=None,
        help="清单文件（默认取视频目录下的 manifest.csv）",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="报告输出目录（默认 reports/eval-<时间戳>）",
    )
    parser.add_argument("--sample-fps", type=int, default=None, help="全局采样帧率")
    parser.add_argument("--annotate", action="store_true", help="同时输出骨架叠加视频")
    parser.add_argument(
        "--exercise",
        action="append",
        default=None,
        help="只评估指定动作（可重复，按名称或类型）",
    )
    args = parser.parse_args()

    videos_dir = Path(args.videos_dir)
    manifest_path = (
        Path(args.manifest) if args.manifest else videos_dir / "manifest.csv"
    )
    if not manifest_path.is_file():
        raise SystemExit(f"找不到清单文件：{manifest_path}")
    output_dir = (
        Path(args.output)
        if args.output
        else Path("reports") / f"eval-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    )

    report = evaluate_videos(
        videos_dir,
        manifest_path,
        output_dir,
        sample_fps=args.sample_fps,
        annotate=args.annotate,
        exercise_filter=args.exercise,
    )
    summary = report["summary"]
    printable = {
        "samples": summary["samples"],
        "scored": summary["scored"],
        "analysis_failures": summary["analysis_failures"],
        "count": summary["count"],
        "usable": summary["usable"],
        "phases": summary["phases"],
        "report_markdown": report["report_markdown"],
        "report_json": report["report_json"],
    }
    print(json.dumps(printable, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
