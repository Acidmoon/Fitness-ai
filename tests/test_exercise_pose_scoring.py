import math

import pytest
from fastapi import status

from app.models.exercise import Exercise, ExerciseRecord
from app.services.exercise_pose_scoring import (
    AngleSample,
    PoseScoringUnavailableError,
    calculate_joint_angle,
    extract_movement_phases,
    extract_phase_summary,
    find_scoring_rule,
    keypoints_have_confidence,
    score_record_pose,
)


def make_pose_analysis(angles, exercise_type="squat", confidence=0.9):
    return {
        "schema_version": 1,
        "status": "done",
        "model": {"name": "thunder", "input_size": 256},
        "summary": {
            "total_frames": len(angles),
            "processed_frames": len(angles),
            "sampled_frames": len(angles),
            "valid_frame_count": len(angles),
            "average_confidence": confidence,
            "source_fps": 30.0,
            "sample_fps": 5,
        },
        "frames": [
            make_frame(index, angle, exercise_type, confidence)
            for index, angle in enumerate(angles)
        ],
    }


def make_frame(index, angle, exercise_type="squat", confidence=0.9):
    if exercise_type == "squat":
        left = make_triplet(
            "left_hip",
            "left_knee",
            "left_ankle",
            angle,
            origin_x=100,
            confidence=confidence,
        )
        right = make_triplet(
            "right_hip",
            "right_knee",
            "right_ankle",
            angle,
            origin_x=180,
            confidence=confidence,
        )
    else:
        left = make_triplet(
            "left_shoulder",
            "left_elbow",
            "left_wrist",
            angle,
            origin_x=100,
            confidence=confidence,
        )
        right = make_triplet(
            "right_shoulder",
            "right_elbow",
            "right_wrist",
            angle,
            origin_x=180,
            confidence=confidence,
        )

    return {
        "frame_index": index,
        "timestamp_ms": index * 200,
        "keypoints": left + right,
    }


def make_full_body_pushup_frame(
    index,
    angle,
    confidence=0.9,
    right_angle=None,
    hip_offset_x=0,
    timestamp_ms=None,
):
    left = make_triplet(
        "left_shoulder",
        "left_elbow",
        "left_wrist",
        angle,
        origin_x=100,
        confidence=confidence,
    )
    right = make_triplet(
        "right_shoulder",
        "right_elbow",
        "right_wrist",
        right_angle if right_angle is not None else angle,
        origin_x=180,
        confidence=confidence,
    )
    left.extend(
        [
            {
                "name": "left_hip",
                "x": 100 + hip_offset_x,
                "y": 100,
                "score": confidence,
            },
            {"name": "left_ankle", "x": 100, "y": 180, "score": confidence},
        ]
    )
    right.extend(
        [
            {
                "name": "right_hip",
                "x": 180 + hip_offset_x,
                "y": 100,
                "score": confidence,
            },
            {"name": "right_ankle", "x": 180, "y": 180, "score": confidence},
        ]
    )
    return {
        "frame_index": index,
        "timestamp_ms": index * 200 if timestamp_ms is None else timestamp_ms,
        "keypoints": left + right,
    }


def make_full_body_pushup_analysis(frames):
    return {
        "schema_version": 1,
        "status": "done",
        "model": {"name": "thunder", "input_size": 256},
        "summary": {
            "total_frames": len(frames),
            "processed_frames": len(frames),
            "sampled_frames": len(frames),
            "valid_frame_count": len(frames),
            "average_confidence": 0.9,
            "source_fps": 30.0,
            "sample_fps": 5,
        },
        "frames": frames,
    }


def make_triplet(start, middle, end, angle, origin_x=100, confidence=0.9):
    length = 80
    radians = math.radians(angle)
    middle_x = origin_x
    middle_y = 100
    return [
        {
            "name": start,
            "x": middle_x,
            "y": middle_y - length,
            "score": confidence,
        },
        {"name": middle, "x": middle_x, "y": middle_y, "score": confidence},
        {
            "name": end,
            "x": middle_x + math.sin(radians) * length,
            "y": middle_y - math.cos(radians) * length,
            "score": confidence,
        },
    ]


def create_record(
    db_session,
    user_id,
    exercise_name="标准深蹲",
    keypoints_data=None,
    score=40,
    count=3,
    feedback="用户原始反馈",
):
    exercise = Exercise(name=exercise_name, category="测试")
    db_session.add(exercise)
    db_session.commit()

    record = ExerciseRecord(
        user_id=user_id,
        exercise_id=exercise.id,
        score=score,
        count=count,
        duration=60,
        keypoints_data=keypoints_data,
        feedback=feedback,
    )
    db_session.add(record)
    db_session.commit()
    return record


def auth_headers(test_user):
    return {"Authorization": f"Bearer {test_user['token']}"}


class TestPoseMetricHelpers:
    def test_calculate_joint_angle_from_named_keypoints(self):
        keypoints = {
            "hip": {"x": 0, "y": -1, "score": 0.9},
            "knee": {"x": 0, "y": 0, "score": 0.9},
            "ankle": {"x": 1, "y": 0, "score": 0.9},
        }

        angle = calculate_joint_angle(keypoints, "hip", "knee", "ankle")

        assert round(angle, 2) == 90

    def test_keypoints_have_confidence_requires_all_points(self):
        keypoints = {
            "hip": {"score": 0.9},
            "knee": {"score": 0.7},
            "ankle": {"score": 0.2},
        }

        assert not keypoints_have_confidence(keypoints, ("hip", "knee", "ankle"), 0.35)
        assert keypoints_have_confidence(keypoints, ("hip", "knee"), 0.35)

    def test_extract_movement_phases_counts_complete_cycles(self):
        samples = [
            AngleSample(0, 0, 165, 0.9),
            AngleSample(1, 200, 100, 0.9),
            AngleSample(2, 400, 166, 0.9),
            AngleSample(3, 600, 102, 0.9),
            AngleSample(4, 800, 168, 0.9),
        ]

        summary = extract_movement_phases(samples, down_angle=115, up_angle=155)

        assert summary.repetitions == 2
        assert summary.min_angle == 100
        assert summary.max_angle == 168

    def test_extract_pushup_phase_summary_returns_full_phase_cycle(self):
        exercise = Exercise(name="标准俯卧撑", category="上肢")
        rule = find_scoring_rule(exercise)
        samples = [
            AngleSample(0, 0, 162, 0.9),
            AngleSample(1, 200, 132, 0.9),
            AngleSample(2, 400, 86, 0.9),
            AngleSample(3, 600, 118, 0.9),
            AngleSample(4, 800, 164, 0.9),
        ]

        assert rule is not None
        summary = extract_phase_summary(samples, rule)

        assert summary.repetitions == 1
        assert [phase["phase"] for phase in summary.phases] == [
            "ready",
            "down",
            "bottom",
            "up",
            "complete",
        ]
        assert summary.repetition_details[0]["bottom_frame_index"] == 2


class TestPoseScoringRules:
    def test_scores_supported_lower_body_exercise(self, db_session, test_user):
        record = create_record(
            db_session,
            test_user["user"].id,
            exercise_name="标准深蹲",
            keypoints_data=make_pose_analysis([165, 100, 166, 102, 168]),
        )

        result = score_record_pose(record)

        assert result["status"] == "scored"
        assert result["exercise_type"] == "squat"
        assert result["count"] == 2
        assert result["score"] == 100

    def test_scores_supported_upper_body_exercise(self, db_session, test_user):
        record = create_record(
            db_session,
            test_user["user"].id,
            exercise_name="标准俯卧撑",
            keypoints_data=make_pose_analysis([160, 85, 162], "push_up"),
        )

        result = score_record_pose(record)

        assert result["status"] == "scored"
        assert result["exercise_type"] == "push_up"
        assert result["count"] == 1
        assert result["auto_count"] == 1
        assert result["count_source"] == "angle_peak_valley"
        assert [phase["phase"] for phase in result["metrics"]["phases"]] == [
            "ready",
            "down",
            "bottom",
            "up",
            "complete",
        ]
        assert result["metrics"]["valid_reps"][0]["bottom_angle"] == 85.0
        assert result["metrics"]["invalid_reps"] == []
        assert result["metrics"]["quality"]["version"] == "standard_quality_v1"
        assert "joint_angle" in result["metrics"]["quality"]["dimensions"]

    def test_standard_quality_penalizes_body_line_and_symmetry(
        self, db_session, test_user
    ):
        record = create_record(
            db_session,
            test_user["user"].id,
            exercise_name="标准俯卧撑",
            keypoints_data=make_full_body_pushup_analysis(
                [
                    make_full_body_pushup_frame(0, 162, right_angle=135, hip_offset_x=45),
                    make_full_body_pushup_frame(1, 85, right_angle=120, hip_offset_x=45),
                    make_full_body_pushup_frame(2, 164, right_angle=138, hip_offset_x=45),
                ]
            ),
        )

        result = score_record_pose(record)
        quality = result["metrics"]["quality"]

        assert result["score"] < 100
        assert quality["dimensions"]["body_alignment"]["score"] < 85
        assert quality["dimensions"]["left_right_symmetry"]["score"] < 85
        assert "身体直线度不足" in "\n".join(result["feedback"])
        assert "左右关节角度差异偏大" in "\n".join(result["feedback"])

    def test_standard_quality_penalizes_unstable_rhythm(
        self, db_session, test_user
    ):
        record = create_record(
            db_session,
            test_user["user"].id,
            exercise_name="标准俯卧撑",
            keypoints_data=make_full_body_pushup_analysis(
                [
                    make_full_body_pushup_frame(0, 162, timestamp_ms=0),
                    make_full_body_pushup_frame(1, 85, timestamp_ms=200),
                    make_full_body_pushup_frame(2, 164, timestamp_ms=400),
                    make_full_body_pushup_frame(3, 84, timestamp_ms=2200),
                    make_full_body_pushup_frame(4, 166, timestamp_ms=4200),
                ]
            ),
        )

        result = score_record_pose(record)

        assert result["count"] == 2
        assert result["metrics"]["quality"]["dimensions"]["rhythm_stability"][
            "score"
        ] < 85
        assert "动作节奏波动较大" in "\n".join(result["feedback"])

    def test_unsupported_exercise_returns_status(self, db_session, test_user):
        record = create_record(
            db_session,
            test_user["user"].id,
            exercise_name="平板支撑",
            keypoints_data=make_pose_analysis([160, 90, 160]),
        )

        result = score_record_pose(record)

        assert result["status"] == "unsupported"
        assert result["score"] is None

    def test_low_confidence_prevents_scoring(self, db_session, test_user):
        record = create_record(
            db_session,
            test_user["user"].id,
            keypoints_data=make_pose_analysis([165, 100, 166], confidence=0.1),
        )

        with pytest.raises(PoseScoringUnavailableError):
            score_record_pose(record)


class TestPoseScoringApi:
    def test_preview_scoring_does_not_modify_record(
        self, client, db_session, test_user
    ):
        record = create_record(
            db_session,
            test_user["user"].id,
            keypoints_data=make_pose_analysis([165, 100, 166, 102, 168]),
        )

        response = client.post(
            f"/api/ai/records/{record.id}/pose-scoring",
            headers=auth_headers(test_user),
            json={"apply": False},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "scored"
        assert data["applied"] is False
        assert data["score"] == 100

        db_session.refresh(record)
        assert record.score == 40
        assert record.count == 3
        assert record.feedback == "用户原始反馈"

    def test_apply_scoring_updates_record(self, client, db_session, test_user):
        record = create_record(
            db_session,
            test_user["user"].id,
            keypoints_data=make_pose_analysis([165, 100, 166, 102, 168]),
        )

        response = client.post(
            f"/api/ai/records/{record.id}/pose-scoring",
            headers=auth_headers(test_user),
            json={"apply": True},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["applied"] is True
        assert data["count"] == 2

        db_session.refresh(record)
        assert record.score == 100
        assert record.count == 2
        assert "动作轨迹完整" in record.feedback

    def test_apply_pushup_phase_scoring_updates_record(
        self, client, db_session, test_user
    ):
        record = create_record(
            db_session,
            test_user["user"].id,
            exercise_name="标准俯卧撑",
            keypoints_data=make_pose_analysis(
                [162, 132, 86, 118, 164], exercise_type="push_up"
            ),
        )

        response = client.post(
            f"/api/ai/records/{record.id}/pose-scoring",
            headers=auth_headers(test_user),
            json={"apply": True},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["applied"] is True
        assert data["count"] == 1
        assert data["auto_count"] == 1
        assert data["count_source"] == "angle_peak_valley"
        assert [phase["phase"] for phase in data["metrics"]["phases"]] == [
            "ready",
            "down",
            "bottom",
            "up",
            "complete",
        ]

        db_session.refresh(record)
        assert record.count == 1
        assert record.score == 100
        assert "动作轨迹完整" in record.feedback

    def test_scoring_requires_pose_analysis(self, client, db_session, test_user):
        record = create_record(db_session, test_user["user"].id, keypoints_data=None)

        response = client.post(
            f"/api/ai/records/{record.id}/pose-scoring",
            headers=auth_headers(test_user),
            json={"apply": False},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "缺少姿态分析数据" in response.json()["detail"]

    def test_apply_unsupported_exercise_does_not_modify_record(
        self, client, db_session, test_user
    ):
        record = create_record(
            db_session,
            test_user["user"].id,
            exercise_name="平板支撑",
            keypoints_data=make_pose_analysis([165, 100, 166]),
        )

        response = client.post(
            f"/api/ai/records/{record.id}/pose-scoring",
            headers=auth_headers(test_user),
            json={"apply": True},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "unsupported"

        db_session.refresh(record)
        assert record.score == 40
        assert record.count == 3
        assert record.feedback == "用户原始反馈"

    def test_scoring_hides_other_users_record(self, client, db_session, test_user):
        record = create_record(
            db_session,
            test_user["user"].id + 1,
            keypoints_data=make_pose_analysis([165, 100, 166]),
        )

        response = client.post(
            f"/api/ai/records/{record.id}/pose-scoring",
            headers=auth_headers(test_user),
            json={"apply": False},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
