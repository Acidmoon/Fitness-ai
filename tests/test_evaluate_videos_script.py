"""`scripts/evaluate_videos.py` 的端到端冒烟测试（伪造推理结果）。"""

import importlib.util
import json
import math
from pathlib import Path

import pytest

cv2 = pytest.importorskip("cv2")
np = pytest.importorskip("numpy")

from app.schemas.pose_analysis import POSE_ANALYSIS_SCHEMA_VERSION  # noqa: E402

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "evaluate_videos.py"


def load_script_module():
    spec = importlib.util.spec_from_file_location("evaluate_videos_script", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def elbow_triplet(prefix: str, angle_degrees: float, confidence: float = 0.9):
    length = 80.0
    radians = math.radians(angle_degrees)
    return [
        {"name": f"{prefix}_shoulder", "x": 100.0, "y": 20.0, "score": confidence},
        {"name": f"{prefix}_elbow", "x": 100.0, "y": 100.0, "score": confidence},
        {
            "name": f"{prefix}_wrist",
            "x": 100.0 + math.sin(radians) * length,
            "y": 100.0 - math.cos(radians) * length,
            "score": confidence,
        },
    ]


def fake_analysis(angles=(165, 90, 165)):
    frames = []
    for index, angle in enumerate(angles):
        keypoints = elbow_triplet("left", angle) + elbow_triplet("right", angle)
        frames.append(
            {
                "frame_index": index,
                "timestamp_ms": index * 200,
                "coordinate_space": "image_pixels",
                "keypoints": keypoints,
            }
        )
    return {
        "schema_version": POSE_ANALYSIS_SCHEMA_VERSION,
        "status": "done",
        "coordinate_space": "image_pixels",
        "model": {"backend": "movenet", "name": "thunder"},
        "video": {"source_fps": 10.0, "sample_fps": 5, "processed_frames": len(frames)},
        "frames": frames,
    }


def write_synthetic_video(path: Path, frames: int = 6) -> bool:
    writer = cv2.VideoWriter(
        str(path), cv2.VideoWriter_fourcc(*"mp4v"), 10.0, (320, 240)
    )
    if not writer.isOpened():
        return False
    for index in range(frames):
        writer.write(np.full((240, 320, 3), index * 20, dtype=np.uint8))
    writer.release()
    return True


def test_evaluate_videos_writes_report_and_metrics(tmp_path, monkeypatch):
    module = load_script_module()
    videos_dir = tmp_path / "videos"
    videos_dir.mkdir()
    if not write_synthetic_video(videos_dir / "pushup_ok.mp4"):
        pytest.skip("当前 OpenCV 构建没有可用的 mp4v 编码器")
    if not write_synthetic_video(videos_dir / "pushup_short.mp4"):
        pytest.skip("当前 OpenCV 构建没有可用的 mp4v 编码器")

    (videos_dir / "manifest.csv").write_text(
        "file,exercise,expected_count,expected_errors,expected_usable,camera_angle,notes\n"
        "pushup_ok.mp4,俯卧撑,1,-,yes,side,标准\n"
        "pushup_short.mp4,俯卧撑,2,-,yes,side,少一次\n"
        "missing.mp4,俯卧撑,1,-,yes,side,文件缺失\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(
        "app.services.video_pose_analysis.analyze_video_file",
        lambda *args, **kwargs: fake_analysis(),
    )

    output_dir = tmp_path / "reports"
    report = module.evaluate_videos(
        videos_dir,
        videos_dir / "manifest.csv",
        output_dir,
        sample_fps=5,
        annotate=True,
    )

    assert (output_dir / "report.json").is_file()
    assert (output_dir / "report.md").is_file()
    assert report["summary"]["samples"] == 3
    assert report["summary"]["scored"] == 2
    assert report["summary"]["analysis_failures"] == 1
    assert report["summary"]["count"]["compared"] == 2
    assert report["summary"]["count"]["mae"] == 0.5
    assert report["summary"]["count"]["within_one_rate"] == 1.0
    assert report["rule_versions"] == ["push_up-v3"]

    annotated = sorted((output_dir / "annotated").glob("*.mp4"))
    assert [path.name for path in annotated] == ["pushup_ok.mp4", "pushup_short.mp4"]

    payload = json.loads((output_dir / "report.json").read_text(encoding="utf-8"))
    assert payload["summary"]["analysis_failure_files"] == ["missing.mp4"]
    assert "次数准确率" in (output_dir / "report.md").read_text(encoding="utf-8")


def test_evaluate_videos_filters_by_exercise(tmp_path, monkeypatch):
    module = load_script_module()
    videos_dir = tmp_path / "videos"
    videos_dir.mkdir()
    if not write_synthetic_video(videos_dir / "pushup_ok.mp4"):
        pytest.skip("当前 OpenCV 构建没有可用的 mp4v 编码器")

    (videos_dir / "manifest.csv").write_text(
        "file,exercise,expected_count\n"
        "pushup_ok.mp4,俯卧撑,1\n"
        "squat_missing.mp4,深蹲,3\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "app.services.video_pose_analysis.analyze_video_file",
        lambda *args, **kwargs: fake_analysis(),
    )

    report = module.evaluate_videos(
        videos_dir,
        videos_dir / "manifest.csv",
        tmp_path / "reports",
        exercise_filter=["深蹲"],
    )

    assert report["summary"]["samples"] == 1
    assert report["summary"]["analysis_failures"] == 1
    assert report["summary"]["analysis_failure_files"] == ["squat_missing.mp4"]


def test_evaluate_videos_marks_unsupported_exercise(tmp_path, monkeypatch):
    module = load_script_module()
    videos_dir = tmp_path / "videos"
    videos_dir.mkdir()
    if not write_synthetic_video(videos_dir / "unknown.mp4"):
        pytest.skip("当前 OpenCV 构建没有可用的 mp4v 编码器")

    (videos_dir / "manifest.csv").write_text(
        "file,exercise,expected_count\nunknown.mp4,未知动作,1\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "app.services.video_pose_analysis.analyze_video_file",
        lambda *args, **kwargs: fake_analysis(),
    )

    report = module.evaluate_videos(
        videos_dir, videos_dir / "manifest.csv", tmp_path / "reports"
    )

    assert report["summary"]["unsupported_exercises"] == 1
    assert report["summary"]["analysis_failures"] == 0
