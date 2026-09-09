"""骨架叠加绘制测试（需要 OpenCV）。"""

import pytest

cv2 = pytest.importorskip("cv2")
np = pytest.importorskip("numpy")

from app.services.pose_keypoint_result import STANDARD_KEYPOINT_NAMES  # noqa: E402
from app.services.pose_overlay import (  # noqa: E402
    COCO_SKELETON_EDGES,
    confidence_color,
    draw_frame_caption,
    draw_pose_overlay,
    summarize_confidence,
)


def make_keypoints(scores=None, offsets=None):
    scores = scores or [0.9] * len(STANDARD_KEYPOINT_NAMES)
    offsets = offsets or [
        (60 + (index % 6) * 40, 80 + (index // 6) * 60)
        for index in range(len(STANDARD_KEYPOINT_NAMES))
    ]
    return [
        {
            "name": name,
            "x": float(offsets[index][0]),
            "y": float(offsets[index][1]),
            "score": float(scores[index]),
        }
        for index, name in enumerate(STANDARD_KEYPOINT_NAMES)
    ]


def blank_frame(width=640, height=480):
    return np.zeros((height, width, 3), dtype=np.uint8)


def test_skeleton_edges_cover_standard_keypoints():
    names = set(STANDARD_KEYPOINT_NAMES)
    assert len(COCO_SKELETON_EDGES) == 16
    for start, end in COCO_SKELETON_EDGES:
        assert start in names and end in names


def test_draw_pose_overlay_marks_pixels():
    frame = blank_frame()
    result = draw_pose_overlay(frame, make_keypoints())

    assert result is frame
    assert int(np.count_nonzero(frame)) > 0


def test_low_confidence_keypoints_are_not_drawn():
    frame = blank_frame()
    draw_pose_overlay(frame, make_keypoints(scores=[0.1] * 17), min_confidence=0.3)

    assert int(np.count_nonzero(frame)) == 0


def test_confidence_color_buckets():
    assert confidence_color(0.9) != confidence_color(0.4)
    assert confidence_color(0.4) != confidence_color(0.1)


def test_angle_label_changes_the_frame():
    keypoints = make_keypoints()
    plain = blank_frame()
    labeled = blank_frame()

    draw_pose_overlay(plain, keypoints)
    draw_pose_overlay(
        labeled,
        keypoints,
        angle_labels=(("left_elbow", ("left_shoulder", "left_elbow", "left_wrist")),),
    )

    assert int(np.count_nonzero(labeled)) > int(np.count_nonzero(plain))


def test_missing_triplet_keypoints_are_skipped():
    keypoints = [
        keypoint
        for keypoint in make_keypoints()
        if keypoint["name"] not in {"left_shoulder", "left_wrist"}
    ]
    frame = blank_frame()

    draw_pose_overlay(
        frame,
        keypoints,
        angle_labels=(("left_elbow", ("left_shoulder", "left_elbow", "left_wrist")),),
    )

    assert int(np.count_nonzero(frame)) > 0


def test_caption_and_names_are_drawn():
    frame = blank_frame()
    draw_pose_overlay(
        frame, make_keypoints(), show_names=True, caption="frame 12  t=1200ms"
    )

    assert int(np.count_nonzero(frame)) > 0

    caption_only = blank_frame()
    draw_frame_caption(caption_only, "frame 12")
    assert int(np.count_nonzero(caption_only)) > 0


def test_summarize_confidence_reports_minimum_and_low_count():
    summary = summarize_confidence(make_keypoints(scores=[0.9] * 16 + [0.2]))

    assert summary["count"] == 17
    assert summary["minimum"] == pytest.approx(0.2)
    assert summary["below_threshold"] == 1.0
    assert 0.8 < summary["average"] < 0.9


def test_summarize_confidence_handles_empty_input():
    assert summarize_confidence([])["count"] == 0
