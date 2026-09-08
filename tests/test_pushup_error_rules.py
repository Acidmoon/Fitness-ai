"""俯卧撑身体直线类错误判据（push_up-v3）。

国标只给了一句“身体未保持平直”，塌腰和撅臀是它的两种相反表现，
因此必须落到两个 code 上，且方向不成立时不得假装判出方向。
"""

from app.services.exercise_rules.base import ExerciseRule, JointTriplet, PhaseSummary
from app.services.pose_error_detection import detect_pose_errors

SHOULDER_Y = 100.0


def make_pushup_rule() -> ExerciseRule:
    return ExerciseRule(
        exercise_type="push_up",
        aliases=("俯卧撑",),
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
        rule_version="push_up-v3",
    )


def prone_frame(hip_y_left=135.0, hip_y_right=None, timestamp_ms=0, frame_index=0):
    """肩-踝轴水平的俯卧姿势；髋的 y 值决定塌腰还是撅臀。"""
    hip_y_right = hip_y_left if hip_y_right is None else hip_y_right
    points = {
        "left_shoulder": (0.0, SHOULDER_Y),
        "right_shoulder": (0.0, SHOULDER_Y + 1.0),
        "left_elbow": (60.0, 40.0),
        "right_elbow": (60.0, 41.0),
        "left_wrist": (120.0, SHOULDER_Y),
        "right_wrist": (120.0, SHOULDER_Y + 1.0),
        "left_hip": (150.0, hip_y_left),
        "right_hip": (150.0, hip_y_right),
        "left_ankle": (300.0, SHOULDER_Y),
        "right_ankle": (300.0, SHOULDER_Y + 1.0),
    }
    keypoints = [
        {"name": name, "x": x, "y": y, "score": 0.9} for name, (x, y) in points.items()
    ]
    return {
        "frame_index": frame_index,
        "timestamp_ms": timestamp_ms,
        "keypoints": keypoints,
    }


def upright_frame(hip_x=150.0, timestamp_ms=0):
    """肩-踝轴竖直：此时“髋在连线上下”不再对应重力方向。"""
    points = {
        "left_shoulder": (100.0, 0.0),
        "right_shoulder": (101.0, 0.0),
        "left_elbow": (100.0, 60.0),
        "right_elbow": (101.0, 60.0),
        "left_wrist": (100.0, 120.0),
        "right_wrist": (101.0, 120.0),
        "left_hip": (hip_x, 200.0),
        "right_hip": (hip_x, 200.0),
        "left_ankle": (100.0, 300.0),
        "right_ankle": (101.0, 300.0),
    }
    keypoints = [
        {"name": name, "x": x, "y": y, "score": 0.9} for name, (x, y) in points.items()
    ]
    return {
        "frame_index": 0,
        "timestamp_ms": timestamp_ms,
        "keypoints": keypoints,
    }


def make_phase_summary(repetition_details=None) -> PhaseSummary:
    return PhaseSummary(
        repetitions=len(repetition_details or []),
        phases=[],
        min_angle=120.0,
        max_angle=165.0,
        angle_range=45.0,
        average_confidence=0.9,
        repetition_details=repetition_details or [],
        invalid_repetition_details=[],
        count_source="angle_peak_valley",
    )


def detect(frames, phase_summary=None):
    errors = detect_pose_errors(
        frames,
        [],
        phase_summary or make_phase_summary(),
        make_pushup_rule(),
    )
    return {error["code"]: error for error in errors}


def test_hip_below_line_is_sagging_not_pike():
    codes = detect([prone_frame(hip_y_left=135.0, hip_y_right=135.0)])

    assert "push_up_sagging_waist" in codes
    assert "push_up_hip_pike" not in codes
    evidence = codes["push_up_sagging_waist"]["evidence"]
    assert evidence["mean_hip_offset_ratio"] > 0
    assert evidence["average_body_line_deviation"] > 18.0


def test_hip_above_line_is_pike_with_corrective_feedback():
    codes = detect([prone_frame(hip_y_left=65.0, hip_y_right=65.0)])

    assert "push_up_hip_pike" in codes
    assert "push_up_sagging_waist" not in codes
    pike = codes["push_up_hip_pike"]
    assert pike["label"] == "俯卧撑撅臀"
    assert pike["evidence"]["mean_hip_offset_ratio"] < 0
    assert pike["evidence"]["direction"] == "hip_above_line"
    assert "撅臀" in pike["feedback"]


def test_two_body_line_codes_are_mutually_exclusive():
    codes = detect(
        [
            prone_frame(hip_y_left=135.0, hip_y_right=135.0, timestamp_ms=0),
            prone_frame(hip_y_left=135.0, hip_y_right=135.0, timestamp_ms=400),
        ]
    )

    body_line_codes = {
        code for code in codes if code in {"push_up_sagging_waist", "push_up_hip_pike"}
    }
    assert body_line_codes == {"push_up_sagging_waist"}


def test_straight_body_emits_no_body_line_error():
    codes = detect([prone_frame(hip_y_left=100.0, hip_y_right=100.5)])

    assert "push_up_sagging_waist" not in codes
    assert "push_up_hip_pike" not in codes
    assert "push_up_body_twist" not in codes


def test_left_right_asymmetry_is_reported_as_twist():
    codes = detect([prone_frame(hip_y_left=120.0, hip_y_right=100.0)])

    assert "push_up_body_twist" in codes
    # 左右平均后仍在平直容差内，因此不应被误报成塌腰或撅臀。
    assert "push_up_sagging_waist" not in codes
    assert "push_up_hip_pike" not in codes
    evidence = codes["push_up_body_twist"]["evidence"]
    assert evidence["average_left_right_difference"] > 12.0


def test_vertical_body_axis_does_not_claim_a_direction():
    """体轴不接近水平时只报“未保持平直”，不得凭空判定塌腰或撅臀。"""
    codes = detect([upright_frame(hip_x=150.0)])

    body_line_codes = {
        code for code in codes if code in {"push_up_sagging_waist", "push_up_hip_pike"}
    }
    assert body_line_codes == {"push_up_sagging_waist"}
    assert (
        codes["push_up_sagging_waist"]["evidence"]["hip_offset_direction"]
        == "not_applicable"
    )
    assert "mean_hip_offset_ratio" not in codes["push_up_sagging_waist"]["evidence"]


def test_unstable_rep_rhythm_is_flagged():
    summary = make_phase_summary(
        [
            {"index": 1, "valid": True, "duration_ms": 400},
            {"index": 2, "valid": True, "duration_ms": 400},
            {"index": 3, "valid": True, "duration_ms": 1400},
        ]
    )

    codes = detect([prone_frame()], phase_summary=summary)
    rhythm = codes["push_up_rhythm_instability"]

    assert rhythm["severity"] == "minor"
    assert 0.45 < rhythm["evidence"]["duration_coefficient_of_variation"] <= 0.70
    assert rhythm["evidence"]["rep_count"] == 3


def test_stable_rhythm_and_too_few_reps_are_not_flagged():
    stable = make_phase_summary(
        [
            {"index": 1, "valid": True, "duration_ms": 700},
            {"index": 2, "valid": True, "duration_ms": 710},
            {"index": 3, "valid": True, "duration_ms": 690},
        ]
    )
    two_reps = make_phase_summary(
        [
            {"index": 1, "valid": True, "duration_ms": 300},
            {"index": 2, "valid": True, "duration_ms": 3000},
        ]
    )

    assert "push_up_rhythm_instability" not in detect([prone_frame()], stable)
    assert "push_up_rhythm_instability" not in detect([prone_frame()], two_reps)
