"""兼容入口：俯卧撑相位检测已通用化为 `app.services.cycle_phase_detection`。

保留模块与函数名是为了不切断历史导入路径；新周期动作请直接使用
`detect_cycle_phases`，只传本动作的阈值，不要再复制状态机。
"""

from __future__ import annotations

from typing import Sequence

from app.services.cycle_phase_detection import (
    AngleLike,
    CyclePhaseDetectionResult,
    detect_cycle_phases,
)

# 历史名称，等价于通用结果类型。
PushupPhaseDetectionResult = CyclePhaseDetectionResult


def detect_pushup_phases(
    angle_samples: Sequence[AngleLike],
    *,
    down_angle: float,
    up_angle: float,
    movement_epsilon: float = 2.0,
    hysteresis: float = 6.0,
    min_angle_range: float = 45.0,
    min_duration_ms: int = 250,
    max_duration_ms: int = 8000,
    min_average_confidence: float = 0.55,
) -> CyclePhaseDetectionResult:
    """`detect_cycle_phases` 的俯卧撑别名，参数语义完全一致。"""
    return detect_cycle_phases(
        angle_samples,
        down_angle=down_angle,
        up_angle=up_angle,
        movement_epsilon=movement_epsilon,
        hysteresis=hysteresis,
        min_angle_range=min_angle_range,
        min_duration_ms=min_duration_ms,
        max_duration_ms=max_duration_ms,
        min_average_confidence=min_average_confidence,
    )


__all__ = [
    "AngleLike",
    "CyclePhaseDetectionResult",
    "PushupPhaseDetectionResult",
    "detect_pushup_phases",
]
