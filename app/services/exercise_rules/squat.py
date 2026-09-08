from typing import Sequence

from app.services.cycle_phase_detection import detect_cycle_phases
from app.services.exercise_rules.base import (
    AngleSample,
    ExerciseRule,
    JointTriplet,
    PoseScoringUnavailableError,
)


class SquatRule(ExerciseRule):
    """深蹲复用通用周期相位机，只传入关节角阈值。

    这样深蹲与俯卧撑给出同一组证据：`ready -> down -> bottom -> up -> complete`
    相位事件加峰谷有效/无效次数，客户端和评估材料可以同构消费。
    """

    def summarize_phases(self, angle_samples: Sequence[AngleSample]):
        try:
            return detect_cycle_phases(
                angle_samples,
                down_angle=self.down_angle,
                up_angle=self.up_angle,
                min_angle_range=self.min_range,
                min_duration_ms=self.min_rep_duration_ms,
                max_duration_ms=self.max_rep_duration_ms,
                min_average_confidence=self.low_confidence_threshold,
            )
        except ValueError as exc:
            raise PoseScoringUnavailableError("没有可用的关节角序列") from exc


SQUAT_RULE = SquatRule(
    exercise_type="squat",
    aliases=("深蹲", "标准深蹲", "squat"),
    required_keypoints=(
        "left_hip",
        "left_knee",
        "left_ankle",
        "right_hip",
        "right_knee",
        "right_ankle",
    ),
    joint_triplets=(
        JointTriplet("left_hip", "left_knee", "left_ankle"),
        JointTriplet("right_hip", "right_knee", "right_ankle"),
    ),
    min_confidence=0.35,
    min_valid_frames=3,
    down_angle=100,
    up_angle=165,
    target_angle=95,
    min_range=55,
    min_rep_duration_ms=300,
    max_rep_duration_ms=12000,
    rule_version="squat-v2",
    criteria_source=(
        "深蹲不是《国民体质测定标准》成年人部分测试项目（该项目只包含俯卧撑、"
        "1分钟仰卧起坐、纵跳、坐位体前屈、选择反应时、闭眼单脚站立、握力）；"
        "采用 ACSM 力量训练口径：下蹲至大腿与地面平行或更低，起立至髋膝完全伸直方计 1 次"
    ),
    measurement_notes=(
        "髋-膝-踝角在平行位约 90-100 度，受站距和踝背屈影响，down_angle 取 100 作保守边界；"
        "站立位 up_angle 取 165（-15 度容差）；必须正侧方机位、全身入镜，"
        "否则 2D 投影会系统性低估蹲深"
    ),
)
