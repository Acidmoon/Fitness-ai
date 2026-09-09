"""MoveNet letterbox 坐标映射回归测试。

历史缺陷：`normalize_keypoints` 把方形输入内的归一化坐标直接乘上原始帧宽高，没有
反解 letterbox 的缩放与补零。非方形视频因此被各向异性拉伸（16:9 下竖轴压到 H/W），
关节角系统性偏移——竖直方向平分的 90 度会被测成约 121 度，同一动作在 4:3 / 16:9 /
9:16 下会得到不同分数。

这些用例在原始帧像素空间构造几何形状，按 MoveNet 的真实输出约定投影到 letterbox
归一化空间，再要求映射把它还原回原角度，从而锁住“输入预处理与坐标还原必须互逆”。
"""

import math

import pytest

from app.services.pose_analysis_runtime import (
    letterbox_transform,
    normalize_keypoints,
)
from app.services.pose_features import calculate_joint_angle

INPUT_SIZE = 192


def _project_to_letterbox(
    x_px: float, y_px: float, transform, frame_width: int, frame_height: int
) -> tuple[float, float]:
    """原始帧像素 → MoveNet 输出用的 letterbox 归一化坐标。"""

    x_norm = (x_px * transform.scale + transform.x_offset) / transform.input_size
    y_norm = (y_px * transform.scale + transform.y_offset) / transform.input_size
    return x_norm, y_norm


def _angle_at(vertex, first, second) -> float:
    keypoints = {
        "first": {"x": first[0], "y": first[1]},
        "vertex": {"x": vertex[0], "y": vertex[1]},
        "second": {"x": second[0], "y": second[1]},
    }
    return calculate_joint_angle(keypoints, "first", "vertex", "second")


def _angle_points(
    true_angle: float, bisector_degrees: float, arm_length: float
) -> tuple[tuple[float, float], tuple[float, float], tuple[float, float]]:
    half = math.radians(true_angle) / 2
    bisector = math.radians(bisector_degrees)
    vertex = (0.0, 0.0)
    first = (
        math.cos(bisector - half) * arm_length,
        math.sin(bisector - half) * arm_length,
    )
    second = (
        math.cos(bisector + half) * arm_length,
        math.sin(bisector + half) * arm_length,
    )
    return vertex, first, second


def test_letterbox_parameters_match_preprocessing():
    landscape = letterbox_transform(1920, 1080, INPUT_SIZE)
    assert landscape.scale == pytest.approx(0.1)
    assert (landscape.x_offset, landscape.y_offset) == (0, 42)

    portrait = letterbox_transform(1080, 1920, INPUT_SIZE)
    assert portrait.scale == pytest.approx(0.1)
    assert (portrait.x_offset, portrait.y_offset) == (42, 0)

    square = letterbox_transform(512, 512, INPUT_SIZE)
    assert (square.x_offset, square.y_offset) == (0, 0)


def test_landscape_keypoints_are_not_vertically_compressed():
    """16:9 下竖轴曾被压缩到 0.5625，这里直接钉住还原后的像素值。"""

    transform = letterbox_transform(1920, 1080, INPUT_SIZE)
    x_px, y_px = transform.to_frame_pixels(0.5, 0.3)

    assert x_px == pytest.approx(960.0)
    # 旧实现会给出 0.3 * 1080 = 324，把补零区也当成画面内容。
    assert y_px == pytest.approx(156.0)


def test_points_inside_padding_map_outside_the_frame():
    transform = letterbox_transform(1920, 1080, INPUT_SIZE)
    _, y_px = transform.to_frame_pixels(0.5, 0.05)

    assert y_px < 0


@pytest.mark.parametrize(
    "frame_width,frame_height",
    [(1920, 1080), (1080, 1920), (640, 480), (480, 640), (512, 512)],
)
@pytest.mark.parametrize("true_angle", [60.0, 90.0, 120.0, 160.0])
@pytest.mark.parametrize("bisector_degrees", [0.0, 45.0, 90.0])
def test_round_trip_preserves_joint_angles(
    frame_width: int,
    frame_height: int,
    true_angle: float,
    bisector_degrees: float,
):
    transform = letterbox_transform(frame_width, frame_height, INPUT_SIZE)
    arm_length = min(frame_width, frame_height) * 0.25
    vertex, first, second = _angle_points(true_angle, bisector_degrees, arm_length)
    center = (frame_width / 2, frame_height / 2)
    vertex = (vertex[0] + center[0], vertex[1] + center[1])
    first = (first[0] + center[0], first[1] + center[1])
    second = (second[0] + center[0], second[1] + center[1])

    restored = [
        transform.to_frame_pixels(
            *_project_to_letterbox(x, y, transform, frame_width, frame_height)
        )
        for x, y in (vertex, first, second)
    ]

    assert _angle_at(*restored) == pytest.approx(true_angle, abs=0.2)


def test_normalize_keypoints_round_trips_frame_pixels():
    """整条链路：帧像素 → MoveNet 归一化输出 → normalize_keypoints 还原。"""

    frame_width, frame_height = 1920, 1080
    transform = letterbox_transform(frame_width, frame_height, INPUT_SIZE)
    frame_points = [(960.0 + index * 7.0, 300.0 + index * 11.0) for index in range(17)]
    raw_keypoints = [
        [
            [
                [y_norm, x_norm, 0.9]
                for x_norm, y_norm in (
                    _project_to_letterbox(x, y, transform, frame_width, frame_height)
                    for x, y in frame_points
                )
            ]
        ]
    ]

    result = normalize_keypoints(raw_keypoints, transform=transform)

    for keypoint, (expected_x, expected_y) in zip(result, frame_points):
        assert keypoint["x"] == pytest.approx(expected_x, abs=0.01)
        assert keypoint["y"] == pytest.approx(expected_y, abs=0.01)
        assert keypoint["score"] == pytest.approx(0.9)
