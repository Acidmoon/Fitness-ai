from app.services.exercise_rules.base import ExerciseRule, JointTriplet


SQUAT_RULE = ExerciseRule(
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
