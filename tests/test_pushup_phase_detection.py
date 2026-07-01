from app.services.exercise_pose_scoring import AngleSample
from app.services.pushup_phase_detection import detect_pushup_phases


def _samples(angles):
    return [
        AngleSample(
            frame_index=index,
            timestamp_ms=index * 200,
            angle=angle,
            confidence=0.9,
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
