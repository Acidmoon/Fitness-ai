from unittest.mock import patch

from fastapi import status
from sqlalchemy.exc import IntegrityError

from app.services.pose_analysis_runtime import (
    PoseAnalysisInferenceError,
    PoseAnalysisUnavailableError,
)
from app.services.pose_analysis_service import (
    create_pose_analysis_job,
    process_pose_analysis_job,
)
from app.services.video_pose_analysis import compact_pose_analysis_result


def create_exercise_record(db_session, user_id, video_url=None, keypoints_data=None):
    from app.models.exercise import Exercise, ExerciseRecord

    exercise = Exercise(name="测试动作", category="上肢")
    db_session.add(exercise)
    db_session.commit()

    record = ExerciseRecord(
        user_id=user_id,
        exercise_id=exercise.id,
        score=80,
        count=10,
        duration=60,
        video_url=video_url,
        keypoints_data=keypoints_data,
        analysis_revision=0 if keypoints_data else None,
    )
    db_session.add(record)
    db_session.commit()
    return record


def create_other_user(db_session, suffix: str):
    """Create a real foreign-key target for ownership-isolation tests."""
    from app.models.user import User
    from app.utils.security import hash_password

    user = User(
        username=f"pose-other-{suffix}",
        email=f"pose-other-{suffix}@example.com",
        password_hash=hash_password("password123"),
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


def sample_pose_analysis_result():
    return {
        "schema_version": 1,
        "status": "done",
        "model": {"name": "thunder", "input_size": 256},
        "summary": {
            "total_frames": 30,
            "processed_frames": 30,
            "sampled_frames": 1,
            "valid_frame_count": 1,
            "average_confidence": 0.88,
            "source_fps": 30.0,
            "sample_fps": 5,
        },
        "frames": [
            {
                "frame_index": 0,
                "timestamp_ms": 0,
                "keypoints": [{"name": "nose", "x": 10.0, "y": 20.0, "score": 0.88}],
            }
        ],
    }


class TestPoseAnalysisApi:
    def test_trigger_pose_analysis_requires_auth(self, client, db_session):
        response = client.post("/api/ai/records/1/pose-analysis")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_inactive_user_cannot_trigger_pose_analysis(
        self, client, db_session, inactive_test_user
    ):
        headers = {"Authorization": f"Bearer {inactive_test_user['token']}"}
        response = client.post("/api/ai/records/1/pose-analysis", headers=headers)

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_trigger_pose_analysis_record_not_found(
        self, client, db_session, test_user
    ):
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.post("/api/ai/records/999/pose-analysis", headers=headers)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_trigger_pose_analysis_rejects_record_without_video(
        self, client, db_session, test_user
    ):
        record = create_exercise_record(db_session, test_user["user"].id)
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        response = client.post(
            f"/api/ai/records/{record.id}/pose-analysis", headers=headers
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "没有关联视频" in response.json()["detail"]

    def test_trigger_pose_analysis_rejects_missing_video_file(
        self, client, db_session, test_user, tmp_path
    ):
        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        record = create_exercise_record(
            db_session, test_user["user"].id, video_url="/videos/missing.mp4"
        )
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.post(
                f"/api/ai/records/{record.id}/pose-analysis", headers=headers
            )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "视频文件不存在" in response.json()["detail"]

    def test_trigger_pose_analysis_stores_result(
        self, client, db_session, test_user, tmp_path
    ):
        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        (upload_dir / "test.mp4").write_bytes(b"video")
        record = create_exercise_record(
            db_session, test_user["user"].id, video_url="/videos/test.mp4"
        )
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)), patch(
            "app.services.pose_analysis_service.analyze_video_file",
            return_value=sample_pose_analysis_result(),
        ) as analyze_mock:
            response = client.post(
                f"/api/ai/records/{record.id}/pose-analysis",
                headers=headers,
                json={"sample_fps": 5},
            )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["record_id"] == record.id
        assert data["status"] == "done"
        assert data["model"]["name"] == "thunder"
        assert data["summary"]["average_confidence"] == 0.88
        assert data["frames"][0]["keypoints"][0]["name"] == "nose"
        analyze_mock.assert_called_once()

        db_session.refresh(record)
        assert record.keypoints_data["status"] == "done"

    def test_get_pose_analysis_returns_idle_without_result(
        self, client, db_session, test_user
    ):
        record = create_exercise_record(db_session, test_user["user"].id)
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        response = client.get(
            f"/api/ai/records/{record.id}/pose-analysis", headers=headers
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "idle"
        assert response.json()["frames"] == []

    def test_get_pose_analysis_returns_existing_result(
        self, client, db_session, test_user
    ):
        record = create_exercise_record(
            db_session,
            test_user["user"].id,
            keypoints_data=sample_pose_analysis_result(),
        )
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        response = client.get(
            f"/api/ai/records/{record.id}/pose-analysis", headers=headers
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "done"
        assert response.json()["summary"]["sampled_frames"] == 1

    def test_get_pose_analysis_hides_other_users_record(
        self, client, db_session, test_user
    ):
        other_user = create_other_user(db_session, "result")
        record = create_exercise_record(db_session, user_id=other_user.id)
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        response = client.get(
            f"/api/ai/records/{record.id}/pose-analysis", headers=headers
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_trigger_pose_analysis_runtime_unavailable_preserves_record(
        self, client, db_session, test_user, tmp_path
    ):
        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        (upload_dir / "test.mp4").write_bytes(b"video")
        record = create_exercise_record(
            db_session,
            test_user["user"].id,
            video_url="/videos/test.mp4",
            keypoints_data=sample_pose_analysis_result(),
        )
        original_keypoints_data = record.keypoints_data
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)), patch(
            "app.services.pose_analysis_service.analyze_video_file",
            side_effect=PoseAnalysisUnavailableError("runtime unavailable"),
        ):
            response = client.post(
                f"/api/ai/records/{record.id}/pose-analysis", headers=headers
            )

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        db_session.refresh(record)
        assert record.video_url == "/videos/test.mp4"
        assert record.keypoints_data == original_keypoints_data

    def test_trigger_pose_analysis_failure_preserves_record(
        self, client, db_session, test_user, tmp_path
    ):
        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        (upload_dir / "test.mp4").write_bytes(b"video")
        record = create_exercise_record(
            db_session, test_user["user"].id, video_url="/videos/test.mp4"
        )
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)), patch(
            "app.services.pose_analysis_service.analyze_video_file",
            side_effect=PoseAnalysisInferenceError("analysis failed"),
        ):
            response = client.post(
                f"/api/ai/records/{record.id}/pose-analysis", headers=headers
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        db_session.refresh(record)
        assert record.video_url == "/videos/test.mp4"
        assert record.keypoints_data is None

    def test_create_pose_analysis_job_succeeds_and_stores_result(
        self, client, db_session, test_user, tmp_path
    ):
        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        (upload_dir / "job.mp4").write_bytes(b"video")
        record = create_exercise_record(
            db_session, test_user["user"].id, video_url="/videos/job.mp4"
        )
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)), patch(
            "app.services.pose_analysis_service.analyze_video_file",
            return_value=sample_pose_analysis_result(),
        ) as analyze_mock:
            response = client.post(
                f"/api/ai/records/{record.id}/pose-analysis/jobs",
                headers=headers,
                json={"sample_fps": 5},
            )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["record_id"] == record.id
        assert data["status"] == "queued"
        analyze_mock.assert_called_once()

        job_response = client.get(
            f"/api/ai/pose-analysis/jobs/{data['id']}", headers=headers
        )
        assert job_response.status_code == status.HTTP_200_OK
        assert job_response.json()["status"] == "succeeded"
        assert job_response.json()["result_summary"]["average_confidence"] == 0.88

        db_session.refresh(record)
        assert record.keypoints_data["status"] == "done"

    def test_create_pose_analysis_job_rejects_other_users_record(
        self, client, db_session, test_user
    ):
        other_user = create_other_user(db_session, "create-job")
        record = create_exercise_record(
            db_session, other_user.id, video_url="/videos/job.mp4"
        )
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        response = client.post(
            f"/api/ai/records/{record.id}/pose-analysis/jobs", headers=headers
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_pose_analysis_job_records_failure(
        self, client, db_session, test_user, tmp_path
    ):
        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        (upload_dir / "job.mp4").write_bytes(b"video")
        record = create_exercise_record(
            db_session, test_user["user"].id, video_url="/videos/job.mp4"
        )
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)), patch(
            "app.services.pose_analysis_service.analyze_video_file",
            side_effect=PoseAnalysisInferenceError("analysis failed"),
        ):
            response = client.post(
                f"/api/ai/records/{record.id}/pose-analysis/jobs", headers=headers
            )

        assert response.status_code == status.HTTP_200_OK
        job_id = response.json()["id"]

        job_response = client.get(
            f"/api/ai/pose-analysis/jobs/{job_id}", headers=headers
        )
        assert job_response.status_code == status.HTTP_200_OK
        assert job_response.json()["status"] == "failed"
        assert job_response.json()["error"] == "analysis failed"

        db_session.refresh(record)
        assert record.keypoints_data is None

    def test_get_pose_analysis_job_hides_other_users_job(
        self, client, db_session, test_user
    ):
        from app.models.pose_analysis_job import PoseAnalysisJob

        other_user = create_other_user(db_session, "job")
        record = create_exercise_record(db_session, other_user.id)
        job = PoseAnalysisJob(
            record_id=record.id,
            user_id=other_user.id,
            status="queued",
        )
        db_session.add(job)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.get(f"/api/ai/pose-analysis/jobs/{job.id}", headers=headers)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_latest_pose_analysis_job_uses_current_video_revision(
        self, client, db_session, test_user
    ):
        """客户端恢复轮询时不得连接到旧视频版本的任务。"""
        from app.models.pose_analysis_job import PoseAnalysisJob

        record = create_exercise_record(db_session, test_user["user"].id)
        record.video_revision = 2
        stale_job = PoseAnalysisJob(
            record_id=record.id,
            user_id=test_user["user"].id,
            status="succeeded",
            video_revision=1,
        )
        current_job = PoseAnalysisJob(
            record_id=record.id,
            user_id=test_user["user"].id,
            status="running",
            video_revision=2,
            sample_fps=5,
        )
        db_session.add_all([stale_job, current_job])
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.get(
            f"/api/ai/records/{record.id}/pose-analysis/jobs/latest",
            headers=headers,
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["id"] == current_job.id
        assert response.json()["video_revision"] == 2
        assert response.json()["sample_fps"] == 5

    def test_create_pose_analysis_job_reuses_current_active_job(
        self, db_session, test_user
    ):
        """同一记录和视频版本只能有一个活动任务。"""
        record = create_exercise_record(db_session, test_user["user"].id)

        first = create_pose_analysis_job(
            db_session, record, test_user["user"].id, sample_fps=5
        )
        second = create_pose_analysis_job(
            db_session, record, test_user["user"].id, sample_fps=10
        )

        assert first.created is True
        assert second.created is False
        assert second.job.id == first.job.id
        assert second.job.sample_fps == 5

    def test_create_job_conflict_never_reuses_stale_video_revision(
        self, db_session, test_user
    ):
        """唯一索引冲突后也只能复用当前视频版本的活动任务。"""
        from app.models.pose_analysis_job import PoseAnalysisJob

        record = create_exercise_record(db_session, test_user["user"].id)
        record.video_revision = 1
        db_session.commit()
        original_commit = db_session.commit
        commit_calls = 0

        def inject_stale_conflict():
            nonlocal commit_calls
            commit_calls += 1
            if commit_calls == 1:
                pending_job = next(
                    item for item in db_session.new if isinstance(item, PoseAnalysisJob)
                )
                db_session.expunge(pending_job)
                db_session.add(
                    PoseAnalysisJob(
                        record_id=record.id,
                        user_id=test_user["user"].id,
                        status="queued",
                        video_revision=0,
                    )
                )
                original_commit()
                raise IntegrityError("simulated concurrent insert", {}, Exception())
            original_commit()

        with patch.object(db_session, "commit", side_effect=inject_stale_conflict):
            creation = create_pose_analysis_job(
                db_session, record, test_user["user"].id, sample_fps=5
            )

        jobs = (
            db_session.query(PoseAnalysisJob)
            .filter(PoseAnalysisJob.record_id == record.id)
            .order_by(PoseAnalysisJob.id)
            .all()
        )
        assert creation.created is True
        assert creation.job.video_revision == 1
        assert [job.status for job in jobs] == ["cancelled", "queued"]

    def test_stale_job_cannot_write_result_after_video_revision_changes(
        self, db_session, test_user, tmp_path
    ):
        """分析过程中替换视频后，旧任务只能取消，不能回写新记录。"""
        from sqlalchemy.orm import sessionmaker

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        (upload_dir / "job.mp4").write_bytes(b"video")
        record = create_exercise_record(
            db_session, test_user["user"].id, video_url="/videos/job.mp4"
        )
        creation = create_pose_analysis_job(
            db_session, record, test_user["user"].id, sample_fps=5
        )

        def change_video_revision(_path, sample_fps=None):
            db_session.refresh(record)
            record.video_revision += 1
            record.video_url = "/videos/replaced.mp4"
            db_session.commit()
            return sample_pose_analysis_result()

        isolated_session_factory = sessionmaker(
            bind=db_session.get_bind(),
            autocommit=False,
            autoflush=False,
        )
        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)), patch(
            "app.services.pose_analysis_service.analyze_video_file",
            side_effect=change_video_revision,
        ):
            process_pose_analysis_job(
                creation.job.id,
                creation.job.sample_fps,
                isolated_session_factory,
            )

        db_session.expire_all()
        refreshed_record = db_session.get(type(record), record.id)
        db_session.refresh(creation.job)
        assert refreshed_record.keypoints_data is None
        assert refreshed_record.analysis_revision is None
        assert creation.job.status == "cancelled"
        assert creation.job.result_data is None

    def test_synchronous_analysis_rejects_result_if_video_changes(
        self, client, db_session, test_user, tmp_path
    ):
        """同步分析也必须在写入前重新校验视频版本。"""
        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        (upload_dir / "test.mp4").write_bytes(b"video")
        record = create_exercise_record(
            db_session, test_user["user"].id, video_url="/videos/test.mp4"
        )

        def change_video_revision(_path, sample_fps=None):
            record.video_revision += 1
            db_session.commit()
            return sample_pose_analysis_result()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)), patch(
            "app.services.pose_analysis_service.analyze_video_file",
            side_effect=change_video_revision,
        ):
            response = client.post(
                f"/api/ai/records/{record.id}/pose-analysis",
                headers=headers,
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "视频版本已变化" in response.json()["detail"]
        db_session.refresh(record)
        assert record.keypoints_data is None
        assert record.analysis_revision is None


def test_compact_pose_analysis_result_reduces_stored_frames():
    large_keypoint = {
        "name": "nose",
        "x": 1,
        "y": 2,
        "score": 0.9,
        "padding": "x" * 5000,
    }
    result = {
        "schema_version": 1,
        "status": "done",
        "model": {"name": "thunder", "input_size": 256},
        "summary": {
            "total_frames": 200,
            "processed_frames": 200,
            "sampled_frames": 64,
            "valid_frame_count": 64,
            "average_confidence": 0.9,
            "source_fps": 30.0,
            "sample_fps": 5,
        },
        "frames": [
            {
                "frame_index": index,
                "timestamp_ms": index * 100,
                "keypoints": [large_keypoint],
            }
            for index in range(64)
        ],
    }

    compacted = compact_pose_analysis_result(result)

    assert len(compacted["frames"]) < 64
    assert compacted["summary"]["sampled_frames"] == len(compacted["frames"])
