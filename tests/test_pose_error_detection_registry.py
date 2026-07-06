from app.services.exercise_rules.base import ExerciseRule, JointTriplet, PhaseSummary
from app.services.pose_error_detection import (
    detect_pose_errors,
    get_registered_error_codes,
)


def make_rule(exercise_type: str) -> ExerciseRule:
    return ExerciseRule(
        exercise_type=exercise_type,
        aliases=(exercise_type,),
        required_keypoints=("left_hip", "left_knee", "left_ankle"),
        joint_triplets=(JointTriplet("left_hip", "left_knee", "left_ankle"),),
        min_confidence=0.35,
        min_valid_frames=3,
        down_angle=115,
        up_angle=155,
        target_angle=105,
        min_range=40,
    )


def make_phase_summary() -> PhaseSummary:
    return PhaseSummary(
        repetitions=0,
        phases=[],
        min_angle=130,
        max_angle=155,
        angle_range=25,
        average_confidence=0.9,
        invalid_repetition_details=[{"reasons": ["insufficient_depth"]}],
    )


def test_registered_error_codes_are_discoverable_by_exercise_key():
    assert get_registered_error_codes("push_up") == [
        "push_up_insufficient_range",
        "push_up_sagging_waist",
        "push_up_elbow_flare",
    ]
    assert get_registered_error_codes("squat") == [
        "squat_insufficient_depth",
        "squat_knee_valgus",
        "squat_forward_lean",
    ]


def test_registered_rules_still_emit_existing_range_error_codes():
    pushup_errors = detect_pose_errors(
        [],
        [],
        make_phase_summary(),
        make_rule("push_up"),
    )
    squat_errors = detect_pose_errors(
        [],
        [],
        make_phase_summary(),
        make_rule("squat"),
    )

    assert [error["code"] for error in pushup_errors] == [
        "push_up_insufficient_range"
    ]
    assert [error["code"] for error in squat_errors] == [
        "squat_insufficient_depth"
    ]


def test_unknown_exercise_returns_no_registered_movement_errors():
    assert get_registered_error_codes("jumping_jack") == []
    assert (
        detect_pose_errors(
            [],
            [],
            make_phase_summary(),
            make_rule("jumping_jack"),
        )
        == []
    )
