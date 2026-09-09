"""深蹲相位证据验收（cv-squat-phase-enhancement）。

要求不是“深蹲也能出分”，而是深蹲给出与俯卧撑同构的可解释证据：
`ready -> down -> bottom -> up -> complete` 相位事件 + 每次重复的起止帧。
"""

import pytest

from app.models.exercise import Exercise
from app.services.cycle_phase_detection import detect_cycle_phases
from app.services.exercise_pose_scoring import score_pose_data
from app.services.exercise_rules.squat import SQUAT_RULE

from tests.test_exercise_pose_scoring import make_pose_analysis

SQUAT_TWO_REPS_STANDARD = [176, 92, 176, 90, 176]
SQUAT_ABOVE_PARALLEL = [176, 108, 176]
SQUAT_NO_FULL_STAND = [176, 92, 160]


def _score(angles):
    return score_pose_data(
        Exercise(name="标准深蹲", category="下肢"), make_pose_analysis(angles)
    )


def test_squat_emits_canonical_phase_sequence_per_rep():
    result = _score(SQUAT_TWO_REPS_STANDARD)
    phase_names = [phase["phase"] for phase in result["metrics"]["phases"]]

    assert phase_names == [
        "ready",
        "down",
        "bottom",
        "up",
        "complete",
        "down",
        "bottom",
        "up",
        "complete",
    ]
    assert result["count"] == 2
    assert result["count_source"] == "angle_peak_valley"

    bottoms = [
        phase for phase in result["metrics"]["phases"] if phase["phase"] == "bottom"
    ]
    completes = [
        phase for phase in result["metrics"]["phases"] if phase["phase"] == "complete"
    ]
    # bottom 必须真的到达平行位判据，complete 必须回到站立判据。
    assert all(phase["angle"] <= SQUAT_RULE.down_angle for phase in bottoms)
    assert all(phase["angle"] >= SQUAT_RULE.up_angle for phase in completes)
    # 每个相位事件都可定位到帧与时间戳，便于客户端回放。
    assert all(
        {"frame_index", "timestamp_ms", "angle"} <= set(phase) for phase in bottoms
    )


def test_squat_rep_details_carry_start_bottom_complete_evidence():
    result = _score(SQUAT_TWO_REPS_STANDARD)
    first_rep = result["metrics"]["valid_reps"][0]

    assert first_rep["start_angle"] == 176
    assert first_rep["bottom_angle"] == 92
    assert first_rep["complete_angle"] == 176
    assert first_rep["duration_ms"] >= SQUAT_RULE.min_rep_duration_ms
    assert first_rep["valid"] is True


def test_half_squat_is_rejected_with_phase_evidence():
    result = _score(SQUAT_ABOVE_PARALLEL)
    phase_names = [phase["phase"] for phase in result["metrics"]["phases"]]

    assert result["count"] == 0
    # 未达平行位就不应出现 bottom/complete 事件，这是“为什么没算”的可回放证据。
    assert "bottom" not in phase_names
    assert "complete" not in phase_names
    assert "insufficient_depth" in {
        reason for rep in result["metrics"]["invalid_reps"] for reason in rep["reasons"]
    }
    assert "squat_insufficient_depth" in {
        error["code"] for error in result["metrics"]["errors"]
    }


def test_missing_full_extension_is_not_counted_as_complete_rep():
    result = _score(SQUAT_NO_FULL_STAND)

    assert result["count"] == 0
    assert "incomplete_extension" in {
        reason for rep in result["metrics"]["invalid_reps"] for reason in rep["reasons"]
    }


def test_cycle_detector_requires_empty_input():
    with pytest.raises(ValueError):
        detect_cycle_phases([], down_angle=100, up_angle=165)
