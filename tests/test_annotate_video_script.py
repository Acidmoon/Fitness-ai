"""`scripts/annotate_video.py` 的端到端冒烟测试（需要 OpenCV 与视频编码器）。

用伪造的分析结果替换 MoveNet 推理，验证帧匹配、骨架绘制、视频写出与评分摘要串接，
这样脚本在 OpenCV 版本变化时不会悄悄失效。
"""

import importlib.util
from pathlib import Path

import pytest

cv2 = pytest.importorskip("cv2")
np = pytest.importorskip("numpy")

from app.schemas.pose_analysis import POSE_ANALYSIS_SCHEMA_VERSION  # noqa: E402
from app.services.pose_keypoint_result import (  # noqa: E402
    STANDARD_KEYPOINT_NAMES,
)

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "annotate_video.py"


def load_script_module():
    spec = importlib.util.spec_from_file_location("annotate_video_script", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_synthetic_video(path: Path, frames: int = 20, fps: float = 10.0) -> bool:
    writer = cv2.VideoWriter(
        str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (320, 240)
    )
    if not writer.isOpened():
        return False
    for index in range(frames):
        frame = np.full((240, 320, 3), index * 10, dtype=np.uint8)
        writer.write(frame)
    writer.release()
    return True


def fake_analysis(frames: int = 4):
    keypoints = [
        {
            "name": name,
            "x": 40.0 + (index % 6) * 35.0,
            "y": 40.0 + (index // 6) * 40.0,
            "score": 0.9,
        }
        for index, name in enumerate(STANDARD_KEYPOINT_NAMES)
    ]
    return {
        "schema_version": POSE_ANALYSIS_SCHEMA_VERSION,
        "status": "done",
        "coordinate_space": "image_pixels",
        "model": {"backend": "movenet", "name": "thunder", "input_size": 256},
        "video": {"source_fps": 10.0, "sample_fps": 5, "processed_frames": 20},
        "frames": [
            {
                "frame_index": index * 2,
                "timestamp_ms": index * 200,
                "coordinate_space": "image_pixels",
                "keypoints": keypoints,
            }
            for index in range(frames)
        ],
    }


def test_annotate_video_writes_frames_and_scores(tmp_path, monkeypatch):
    module = load_script_module()
    video = tmp_path / "input.mp4"
    if not write_synthetic_video(video):
        pytest.skip("当前 OpenCV 构建没有可用的 mp4v 编码器")

    monkeypatch.setattr(
        "app.services.video_pose_analysis.analyze_video_file",
        lambda *args, **kwargs: fake_analysis(),
    )

    output = tmp_path / "annotated.mp4"
    result = module.annotate_video(
        video,
        output,
        sample_fps=5,
        angle_values=["left_shoulder,left_elbow,left_wrist"],
        exercise="俯卧撑",
        show_names=False,
        min_confidence=0.3,
        all_frames=False,
        fourcc="mp4v",
    )

    assert output.exists() and output.stat().st_size > 0
    assert result["frames_annotated"] == 4
    assert result["frames_written"] == 4
    assert result["scoring"]["rule_version"] == "push_up-v3"
    assert result["scoring"]["status"] == "scored"

    cap = cv2.VideoCapture(str(output))
    try:
        ok, annotated = cap.read()
    finally:
        cap.release()
    assert ok
    assert int(np.count_nonzero(annotated)) > 0


def test_annotate_video_writes_every_frame_with_all_frames(tmp_path, monkeypatch):
    module = load_script_module()
    video = tmp_path / "input.mp4"
    if not write_synthetic_video(video):
        pytest.skip("当前 OpenCV 构建没有可用的 mp4v 编码器")

    monkeypatch.setattr(
        "app.services.video_pose_analysis.analyze_video_file",
        lambda *args, **kwargs: fake_analysis(),
    )

    output = tmp_path / "annotated_all.mp4"
    result = module.annotate_video(
        video,
        output,
        sample_fps=5,
        angle_values=[],
        exercise=None,
        show_names=False,
        min_confidence=0.3,
        all_frames=True,
        fourcc="mp4v",
    )

    assert result["frames_written"] == result["frames_read"] == 20
    assert result["frames_annotated"] == 4
    assert "scoring" not in result


def test_parse_angles_rejects_incomplete_triplet():
    module = load_script_module()
    with pytest.raises(SystemExit):
        module._parse_angles(["left_shoulder,left_elbow"])


def test_resolve_rule_accepts_chinese_alias():
    module = load_script_module()
    assert module._resolve_rule("俯卧撑").rule_version == "push_up-v3"
    assert module._resolve_rule("push_up").rule_version == "push_up-v3"
    with pytest.raises(SystemExit):
        module._resolve_rule("不存在的动作")
