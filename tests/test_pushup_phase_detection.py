from app.services.exercise_pose_scoring import AngleSample
from app.services.pushup_phase_detection import detect_pushup_phases


def _samples(angles, confidence=0.9):
    return [
        AngleSample(
            frame_index=index,
            timestamp_ms=index * 200,
            angle=angle,
            confidence=confidence,
        )
        for index, angle in enumerate(angles)
    ]


def test_detect_pushup_phases_finds_full_cycle():
    result = detect_pushup_phases(
        _samples([162, 132, 86, 118, 164]),
        down_angle=95,
        up_angle=150,
    )

    assert result.repetitions == 1
    assert [phase["phase"] for phase in result.phases] == [
        "ready",
        "down",
        "bottom",
        "up",
        "complete",
    ]
    assert result.repetition_details == [
        {
            "index": 1,
            "start_frame_index": 0,
            "bottom_frame_index": 2,
            "complete_frame_index": 4,
            "start_timestamp_ms": 0,
            "bottom_timestamp_ms": 400,
            "complete_timestamp_ms": 800,
            "start_angle": 162.0,
            "bottom_angle": 86.0,
            "complete_angle": 164.0,
            "duration_ms": 800,
            "angle_range": 78.0,
            "average_confidence": 0.9,
            "valid": True,
        }
    ]


def test_detect_pushup_phases_counts_multiple_cycles():
    result = detect_pushup_phases(
        _samples([162, 130, 86, 120, 164, 132, 88, 118, 166]),
        down_angle=95,
        up_angle=150,
    )

    assert result.repetitions == 2
    assert [rep["index"] for rep in result.repetition_details] == [1, 2]
    assert result.count_source == "angle_peak_valley"


def test_detect_pushup_phases_rejects_half_cycle():
    result = detect_pushup_phases(
        _samples([162, 130, 86, 116]),
        down_angle=95,
        up_angle=150,
    )

    assert result.repetitions == 0
    assert [phase["phase"] for phase in result.phases] == [
        "ready",
        "down",
        "bottom",
        "up",
    ]
    assert result.repetition_details == []
    assert result.invalid_repetition_details[0]["reasons"] == ["incomplete_extension"]


def test_detect_pushup_phases_rejects_shallow_peak_valley_cycle():
    result = detect_pushup_phases(
        _samples([162, 148, 156]),
        down_angle=95,
        up_angle=150,
    )

    assert result.repetitions == 0
    assert result.repetition_details == []
    assert result.invalid_repetition_details[0]["reasons"] == [
        "insufficient_depth",
        "insufficient_range",
    ]


def test_detect_pushup_phases_rejects_low_confidence_cycle():
    result = detect_pushup_phases(
        _samples([162, 132, 86, 118, 164], confidence=0.4),
        down_angle=95,
        up_angle=150,
        min_average_confidence=0.55,
    )

    assert result.repetitions == 0
    assert result.repetition_details == []
    assert result.invalid_repetition_details[0]["reasons"] == ["low_confidence"]


def test_detect_pushup_phases_uses_peak_valley_counting():
    result = detect_pushup_phases(
        _samples([162, 158, 130, 86, 118, 154, 164]),
        down_angle=95,
        up_angle=150,
    )

    assert result.repetitions == 1
    assert result.repetition_details[0]["bottom_frame_index"] == 3
