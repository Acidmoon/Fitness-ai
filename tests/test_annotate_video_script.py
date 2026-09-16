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


def fake_analysis_from_summary(frames: int = 4, *, stride: int = 3):
    """复刻 analyze_video_file 的真实形状：采样率写在 summary，没有 video 块。

    `stride` 是采样帧之间的真实步长；存储侧压缩采样帧序列时步长会翻倍，
    而 summary.sample_fps 仍是请求值，因此时间基必须按步长推算。
    """

    payload = fake_analysis(frames)
    payload.pop("video")
    payload["summary"] = {
        "source_fps": 30.0,
        "sample_fps": 10,
        "processed_frames": 20,
    }
    for index, frame in enumerate(payload["frames"]):
        frame["frame_index"] = index * stride
        frame["timestamp_ms"] = index * stride * 100
    return payload


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


@pytest.mark.parametrize(
    ("stride", "expected_fps"),
    [
        (3, 10.0),  # 未压缩：源 30 fps、请求 10 fps，每 3 帧取 1 帧
        (6, 5.0),  # 被 payload 上限压缩后步长翻倍，声明的 10 fps 已不成立
    ],
)
def test_annotate_video_keeps_source_timing(
    tmp_path, monkeypatch, stride, expected_fps
):
    """叠加视频必须与源视频等速：时间基按采样帧的实际步长推算。

    存储侧压缩采样帧序列（`frames[::2]`）后 `summary.sample_fps` 仍是请求值，
    因此只信声明值会写出 2 倍速视频。
    """

    module = load_script_module()
    video = tmp_path / "input.mp4"
    if not write_synthetic_video(video, frames=20, fps=30.0):
        pytest.skip("当前 OpenCV 构建没有可用的 mp4v 编码器")

    analysis = fake_analysis_from_summary(frames=4, stride=stride)
    monkeypatch.setattr(
        "app.services.video_pose_analysis.analyze_video_file",
        lambda *args, **kwargs: analysis,
    )

    output = tmp_path / f"annotated_stride{stride}.mp4"
    result = module.annotate_video(
        video,
        output,
        sample_fps=10,
        angle_values=[],
        exercise=None,
        show_names=False,
        min_confidence=0.3,
        all_frames=False,
        fourcc="mp4v",
    )

    assert result["output_fps"] == pytest.approx(expected_fps)
    assert result["sample_fps"] == pytest.approx(expected_fps)

    frames = analysis["frames"]
    source_span = (frames[-1]["frame_index"] - frames[0]["frame_index"]) / 30.0
    output_span = (result["frames_written"] - 1) / result["output_fps"]
    assert output_span == pytest.approx(source_span)


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
