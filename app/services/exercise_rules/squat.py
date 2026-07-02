from typing import Sequence

from app.services.exercise_rules.base import AngleSample, ExerciseRule, JointTriplet
from app.services.exercise_rules.repetition_counter import (
    PeakValleyCounterConfig,
    count_peak_valley_repetitions,
)


class SquatRule(ExerciseRule):
    def summarize_phases(self, angle_samples: Sequence[AngleSample]):
        summary = super().summarize_phases(angle_samples)
        count_result = count_peak_valley_repetitions(
            angle_samples,
            PeakValleyCounterConfig(
                down_angle=self.down_angle,
                up_angle=self.up_angle,
                min_angle_range=self.min_range,
                min_duration_ms=self.min_rep_duration_ms,
                max_duration_ms=self.max_rep_duration_ms,
                min_average_confidence=self.low_confidence_threshold,
            ),
        )
        return type(summary)(
            repetitions=len(count_result.valid_reps),
            phases=summary.phases,
            min_angle=summary.min_angle,
            max_angle=summary.max_angle,
            angle_range=summary.angle_range,
            average_confidence=summary.average_confidence,
            repetition_details=count_result.valid_reps,
            invalid_repetition_details=count_result.invalid_reps,
            count_source=count_result.count_source,
        )


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
    down_angle=115,
    up_angle=155,
    target_angle=105,
    min_range=40,
)
