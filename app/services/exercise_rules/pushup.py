from __future__ import annotations

from typing import Sequence

from app.services.exercise_rules.base import AngleSample, ExerciseRule, JointTriplet
from app.services.pushup_phase_detection import detect_pushup_phases


class PushupRule(ExerciseRule):
    def summarize_phases(self, angle_samples: Sequence[AngleSample]):
        try:
            return detect_pushup_phases(
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
    up_angle=150,
    target_angle=90,
    min_range=45,
)
