from __future__ import annotations

from typing import Sequence

from app.services.exercise_rules.base import AngleSample, ExerciseRule, JointTriplet
from app.services.cycle_phase_detection import detect_cycle_phases


class PushupRule(ExerciseRule):
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
            from app.services.exercise_rules.base import PoseScoringUnavailableError

            raise PoseScoringUnavailableError("没有可用的关节角序列") from exc


PUSHUP_RULE = PushupRule(
    exercise_type="push_up",
    aliases=("俯卧撑", "标准俯卧撑", "pushup", "push-up", "push up"),
    required_keypoints=(
        "left_shoulder",
        "left_elbow",
        "left_wrist",
        "right_shoulder",
        "right_elbow",
        "right_wrist",
    ),
    joint_triplets=(
        JointTriplet("left_shoulder", "left_elbow", "left_wrist"),
        JointTriplet("right_shoulder", "right_elbow", "right_wrist"),
    ),
    min_confidence=0.35,
    min_valid_frames=3,
    down_angle=95,
    up_angle=160,
    target_angle=90,
    min_range=60,
    min_rep_duration_ms=300,
    max_rep_duration_ms=12000,
    rule_version="push_up-v3",
    criteria_source=(
        "《国民体质测定标准手册（成年人部分）》俯卧撑测试方法：屈臂使身体平直下降至"
        "肩与肘处于同一水平面，再平直撑起恢复开始姿势为 1 次；身体未保持平直或未降至"
        "该水平面不计次，测试限时 3 分钟"
    ),
    measurement_notes=(
        "肩肘同水平在正侧机位下等价于肩-肘-腕角约 90 度，down_angle 取 95（+5 度容差）；"
        "撑起要求接近完全伸直，up_angle 取 160（-20 度容差）；min_range 60 用于拒绝半程；"
        "单次时长上下限是防抖动工程参数，不是国标规定"
    ),
)
