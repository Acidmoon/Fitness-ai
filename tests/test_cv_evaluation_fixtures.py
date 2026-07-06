import json
import math
from pathlib import Path

import pytest

from app.models.exercise import Exercise
from app.services.exercise_pose_scoring import score_pose_data


FIXTURE_PATH = (
    Path(__file__).parent
    / "fixtures"
    / "cv_evaluation_samples"
    / "samples.json"
)


def load_cv_samples():
    with FIXTURE_PATH.open(encoding="utf-8") as fixture_file:
        payload = json.load(fixture_file)
    return payload["samples"]


def build_pose_analysis(recipe):
    frames = [
        build_synthetic_frame(index, angle, recipe)
        for index, angle in enumerate(recipe["angles"])
    ]
    confidence = float(recipe.get("confidence", 0.9))
    return {
        "schema_version": 1,
        "status": "done",
        "model": {"name": "synthetic-keypoints", "input_size": 256},
        "summary": {
            "total_frames": len(frames),
            "processed_frames": len(frames),
            "sampled_frames": len(frames),
            "valid_frame_count": len(frames),
            "average_confidence": confidence,
            "source_fps": 30.0,
            "sample_fps": 2.5,
        },
        "frames": frames,
    }


def build_synthetic_frame(index, angle, recipe):
    kind = recipe["kind"]
    confidence = float(recipe.get("confidence", 0.9))
    if kind == "pushup":
        keypoints = build_pushup_keypoints(angle, confidence, recipe)
    elif kind == "squat":
        keypoints = build_squat_keypoints(angle, confidence, recipe)
    else:
        raise ValueError(f"Unsupported synthetic fixture kind: {kind}")

    return {
        "frame_index": index,
        "timestamp_ms": index * 400,
        "keypoints": keypoints,
    }


def build_pushup_keypoints(angle, confidence, recipe):
    hip_offset_x = float(recipe.get("hip_offset_x", 0))
    left = joint_triplet(
        "left_shoulder",
        "left_elbow",
        "left_wrist",
        angle,
        origin_x=100,
        confidence=confidence,
    )
    right = joint_triplet(
        "right_shoulder",
        "right_elbow",
        "right_wrist",
        angle,
        origin_x=180,
        confidence=confidence,
    )
    left.extend(
        [
            keypoint("left_hip", 100 + hip_offset_x, 100, confidence),
            keypoint("left_ankle", 100, 180, confidence),
        ]
    )
    right.extend(
        [
            keypoint("right_hip", 180 + hip_offset_x, 100, confidence),
            keypoint("right_ankle", 180, 180, confidence),
        ]
    )
    if recipe.get("elbow_flare"):
        for point in left + right:
            if point["name"] == "left_elbow":
                point["x"] = 40
            elif point["name"] == "right_elbow":
                point["x"] = 240
    return left + right


def build_squat_keypoints(angle, confidence, recipe):
    left = joint_triplet(
        "left_hip",
        "left_knee",
        "left_ankle",
        angle,
        origin_x=100,
        confidence=confidence,
    )
    right = joint_triplet(
        "right_hip",
        "right_knee",
        "right_ankle",
        angle,
        origin_x=180,
        confidence=confidence,
    )
    if recipe.get("knee_valgus"):
        for point in left + right:
            if point["name"] == "left_knee":
                point["x"] = 130
            elif point["name"] == "right_knee":
                point["x"] = 150
    if recipe.get("forward_lean"):
        left.append(keypoint("left_shoulder", 145, -60, confidence))
        right.append(keypoint("right_shoulder", 225, -60, confidence))
    return left + right


def joint_triplet(start, middle, end, angle, *, origin_x, confidence):
    length = 80
    radians = math.radians(float(angle))
    middle_x = float(origin_x)
    middle_y = 100.0
    return [
        keypoint(start, middle_x, middle_y - length, confidence),
        keypoint(middle, middle_x, middle_y, confidence),
        keypoint(
            end,
            middle_x + math.sin(radians) * length,
            middle_y - math.cos(radians) * length,
            confidence,
        ),
    ]


def keypoint(name, x, y, confidence):
    return {
        "name": name,
        "x": round(float(x), 2),
        "y": round(float(y), 2),
        "score": float(confidence),
    }


def collect_invalid_reasons(result):
    reasons = set()
    for repetition in result["metrics"].get("invalid_reps", []):
        reasons.update(repetition.get("reasons") or [])
    return sorted(reasons)


@pytest.mark.parametrize("sample", load_cv_samples(), ids=lambda sample: sample["id"])
def test_cv_evaluation_sample_matches_expected_scoring(sample):
    expected = sample["expected"]
    pose_analysis = build_pose_analysis(sample["synthetic"])
    exercise = Exercise(name=sample["exercise_name"], category="测试")

    result = score_pose_data(exercise, pose_analysis)

    assert result["status"] == expected["status"]
    assert result["exercise_type"] == expected["exercise_type"]
    assert result["count"] == expected["count"]
    assert collect_invalid_reasons(result) == expected["invalid_reasons"]
    assert result["metrics"]["quality"]["video"]["status"] == expected["quality_status"]
    assert result["metrics"]["quality"]["version"] == "standard_quality_v1"

    actual_error_codes = {error["code"] for error in result["metrics"]["errors"]}
    assert set(expected["representative_errors"]).issubset(actual_error_codes)
