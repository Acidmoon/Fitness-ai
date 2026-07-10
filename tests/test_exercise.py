from fastapi import status


class TestExerciseRecords:
    """运动记录测试"""

    def test_create_record_requires_auth(self, client, db_session):
        """测试创建记录需要认证"""
        response = client.post(
            "/api/exercise/records",
            json={"exercise_id": 1, "score": 85.5, "count": 20, "duration": 120},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_record_success(self, client, db_session, test_user):
        """测试创建记录成功"""
        # 先创建标准动作
        from app.models.exercise import Exercise

        exercise = Exercise(name="标准俯卧撑", category="上肢", description="测试动作")
        db_session.add(exercise)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.post(
            "/api/exercise/records",
            json={
                "exercise_id": exercise.id,
                "score": 85.5,
                "count": 20,
                "duration": 120,
            },
            headers=headers,
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["score"] == 85.5
        assert data["count"] == 20

    def test_create_record_exercise_not_found(self, client, db_session, test_user):
        """测试动作不存在"""
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.post(
            "/api/exercise/records",
            json={"exercise_id": 999, "score": 85.5, "count": 20, "duration": 120},
            headers=headers,
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "动作不存在" in response.json()["detail"]

    def test_inactive_user_cannot_create_record(
        self, client, db_session, inactive_test_user
    ):
        """测试已注销账户无法创建记录"""
        headers = {"Authorization": f"Bearer {inactive_test_user['token']}"}
        response = client.post(
            "/api/exercise/records",
            json={"exercise_id": 1, "score": 85.5, "count": 20, "duration": 120},
            headers=headers,
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_record_rejects_invalid_heart_rate(
        self, client, db_session, test_user
    ):
        """测试创建记录时拒绝异常心率"""
        from app.models.exercise import Exercise

        exercise = Exercise(name="标准俯卧撑", category="上肢", description="测试动作")
        db_session.add(exercise)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.post(
            "/api/exercise/records",
            json={
                "exercise_id": exercise.id,
                "score": 85.5,
                "count": 20,
                "duration": 120,
                "heart_rate_avg": 10,
            },
            headers=headers,
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_create_record_rejects_client_supplied_feedback(
        self, client, db_session, test_user
    ):
        """AI 反馈是服务端派生字段，客户端创建记录时不可写。"""
        from app.models.exercise import Exercise

        exercise = Exercise(name="标准俯卧撑", category="上肢", description="测试动作")
        db_session.add(exercise)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.post(
            "/api/exercise/records",
            json={
                "exercise_id": exercise.id,
                "score": 85.5,
                "count": 20,
                "duration": 120,
                "feedback": "客户端伪造的 AI 反馈",
            },
            headers=headers,
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_create_record_rejects_client_supplied_keypoints_data(
        self, client, db_session, test_user
    ):
        """关键点数据只能由服务端分析流程生成。"""
        from app.models.exercise import Exercise

        exercise = Exercise(name="标准俯卧撑", category="上肢", description="测试动作")
        db_session.add(exercise)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.post(
            "/api/exercise/records",
            json={
                "exercise_id": exercise.id,
                "score": 85.5,
                "count": 20,
                "duration": 120,
                "keypoints_data": {"frames": []},
            },
            headers=headers,
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_get_user_records_requires_auth(self, client, db_session):
        """测试获取记录需要认证"""
        response = client.get("/api/exercise/records")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_user_records(self, client, db_session, test_user):
        """测试获取用户记录"""
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        record = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=85.5,
            count=20,
            duration=120,
        )
        db_session.add(record)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.get("/api/exercise/records", headers=headers)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_get_user_records_includes_video_url(self, client, db_session, test_user):
        """测试获取记录时包含 video_url 字段"""
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        record = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=88,
            count=12,
            duration=75,
            video_url="/videos/test-video.mp4",
        )
        db_session.add(record)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.get("/api/exercise/records", headers=headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data[0]["video_url"] == "/videos/test-video.mp4"

    def test_get_user_records_with_date_range(self, client, db_session, test_user):
        """测试日期范围过滤"""
        from datetime import datetime, timedelta
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        today = datetime.now().date()

        record1 = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
            created_at=datetime.now() - timedelta(days=2),
        )
        record2 = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=85,
            count=15,
            duration=90,
            created_at=datetime.now() - timedelta(days=1),
        )
        record3 = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=90,
            count=20,
            duration=120,
            created_at=datetime.now(),
        )
        db_session.add_all([record1, record2, record3])
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}

        # 只查询最近 1 天的记录
        response = client.get(
            f"/api/exercise/records?start_date={today - timedelta(days=1)}",
            headers=headers,
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()) == 2

    def test_get_user_records_with_utc_date_boundaries(
        self, client, db_session, test_user
    ):
        """测试记录列表按 UTC 日期边界过滤"""
        from datetime import date, datetime
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        before_boundary = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
            created_at=datetime(2025, 12, 31, 23, 59, 59),
        )
        at_boundary = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=85,
            count=15,
            duration=90,
            created_at=datetime(2026, 1, 1, 0, 0, 0),
        )
        db_session.add_all([before_boundary, at_boundary])
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.get(
            f"/api/exercise/records?start_date={date(2026, 1, 1)}",
            headers=headers,
        )

        assert response.status_code == status.HTTP_200_OK
        returned_ids = {record["id"] for record in response.json()}
        assert at_boundary.id in returned_ids
        assert before_boundary.id not in returned_ids

    def test_get_user_records_with_exercise_id_filter(
        self, client, db_session, test_user
    ):
        """测试动作 ID 过滤"""
        from app.models.exercise import Exercise, ExerciseRecord

        # 创建两个不同的动作
        exercise1 = Exercise(name="俯卧撑", category="上肢")
        exercise2 = Exercise(name="深蹲", category="下肢")
        db_session.add_all([exercise1, exercise2])
        db_session.commit()

        # 创建不同动作的记录
        record1 = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise1.id,
            score=80,
            count=10,
            duration=60,
        )
        record2 = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise2.id,
            score=85,
            count=15,
            duration=90,
        )
        db_session.add_all([record1, record2])
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}

        # 只查询 exercise1 的记录
        response = client.get(
            f"/api/exercise/records?exercise_id={exercise1.id}", headers=headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["exercise_id"] == exercise1.id

    def test_inactive_user_cannot_list_records(
        self, client, db_session, inactive_test_user
    ):
        """测试已注销账户无法获取记录列表"""
        headers = {"Authorization": f"Bearer {inactive_test_user['token']}"}
        response = client.get("/api/exercise/records", headers=headers)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_record_detail_success(self, client, db_session, test_user):
        """测试获取单条记录详情成功"""
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        record = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=92,
            count=18,
            duration=95,
            video_url="/videos/detail.mp4",
        )
        db_session.add(record)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.get(f"/api/exercise/records/{record.id}", headers=headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == record.id
        assert data["video_url"] == "/videos/detail.mp4"

    def test_get_record_detail_not_found(self, client, db_session, test_user):
        """测试获取不存在的记录详情"""
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.get("/api/exercise/records/9999", headers=headers)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_inactive_user_cannot_get_record_detail(
        self, client, db_session, inactive_test_user
    ):
        """测试已注销账户无法获取记录详情"""
        headers = {"Authorization": f"Bearer {inactive_test_user['token']}"}
        response = client.get("/api/exercise/records/1", headers=headers)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_exercises(self, client, db_session):
        """测试获取标准动作列表（不需要认证）"""
        # 先创建测试动作
        from app.models.exercise import Exercise

        exercise = Exercise(name="标准俯卧撑", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        response = client.get("/api/exercise/exercises")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)

    def test_update_record_requires_auth(self, client, db_session):
        """测试修改记录需要认证"""
        response = client.put("/api/exercise/records/1", json={"score": 90})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_update_record_success(self, client, db_session, test_user):
        """测试修改记录成功"""
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        record = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
        )
        db_session.add(record)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.put(
            f"/api/exercise/records/{record.id}",
            json={"score": 95},
            headers=headers,
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["score"] == 95
        assert data["count"] == 10  # 其他字段不变

    def test_update_record_not_found(self, client, db_session, test_user):
        """测试修改不存在的记录"""
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.put(
            "/api/exercise/records/999",
            json={"score": 90},
            headers=headers,
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_inactive_user_cannot_update_record(
        self, client, db_session, inactive_test_user
    ):
        """测试已注销账户无法修改记录"""
        headers = {"Authorization": f"Bearer {inactive_test_user['token']}"}
        response = client.put(
            "/api/exercise/records/1",
            json={"score": 90},
            headers=headers,
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_record_rejects_invalid_heart_rate(
        self, client, db_session, test_user
    ):
        """测试更新记录时拒绝异常心率"""
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        record = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
        )
        db_session.add(record)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.put(
            f"/api/exercise/records/{record.id}",
            json={"heart_rate_max": 500},
            headers=headers,
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_update_record_rejects_client_supplied_keypoints_data(
        self, client, db_session, test_user
    ):
        """普通记录更新接口不得覆盖服务端生成的关键点数据。"""
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        record = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
        )
        db_session.add(record)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.put(
            f"/api/exercise/records/{record.id}",
            json={"keypoints_data": {"frames": []}},
            headers=headers,
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_update_record_forbidden(self, client, db_session, test_user):
        """测试不能修改其他用户的记录"""
        from app.models.exercise import Exercise, ExerciseRecord
        from app.models.user import User

        # 创建另一个用户
        other_user = User(
            username="other_user",
            email="other@example.com",
            password_hash="hashed",
            is_active=True,
        )
        db_session.add(other_user)
        db_session.commit()

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        # 创建其他用户的记录
        record = ExerciseRecord(
            user_id=other_user.id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
        )
        db_session.add(record)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.put(
            f"/api/exercise/records/{record.id}",
            json={"score": 90},
            headers=headers,
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_record_requires_auth(self, client, db_session):
        """测试删除记录需要认证"""
        response = client.delete("/api/exercise/records/1")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_delete_record_success(self, client, db_session, test_user):
        """删除记录时级联删除姿态分析任务并清理视频文件。"""
        from app.models.exercise import Exercise, ExerciseRecord
        from app.models.pose_analysis_job import PoseAnalysisJob
        from unittest.mock import patch

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        import tempfile
        from pathlib import Path

        upload_dir = Path(tempfile.mkdtemp())
        video_path = upload_dir / "record-delete.mp4"
        video_path.write_bytes(b"video content")

        record = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
            video_url="/videos/record-delete.mp4",
        )
        db_session.add(record)
        db_session.commit()
        job = PoseAnalysisJob(
            record_id=record.id,
            user_id=test_user["user"].id,
            status="failed",
            video_revision=0,
        )
        db_session.add(job)
        db_session.commit()
        job_id = job.id

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.delete(
                f"/api/exercise/records/{record.id}",
                headers=headers,
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["message"] == "删除成功"

        # 验证记录已被删除
        deleted_record = (
            db_session.query(ExerciseRecord).filter_by(id=record.id).first()
        )
        assert deleted_record is None
        assert db_session.query(PoseAnalysisJob).filter_by(id=job_id).first() is None
        assert not video_path.exists()

    def test_delete_record_not_found(self, client, db_session, test_user):
        """测试删除不存在的记录"""
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.delete(
            "/api/exercise/records/999",
            headers=headers,
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_inactive_user_cannot_delete_record(
        self, client, db_session, inactive_test_user
    ):
        """测试已注销账户无法删除记录"""
        headers = {"Authorization": f"Bearer {inactive_test_user['token']}"}
        response = client.delete("/api/exercise/records/1", headers=headers)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_batch_delete_records_requires_auth(self, client, db_session):
        """测试批量删除需要认证"""
        response = client.delete("/api/exercise/records?record_ids=1&record_ids=2")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_batch_delete_records_success(self, client, db_session, test_user):
        """测试批量删除成功"""
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        # 创建多条记录
        records = [
            ExerciseRecord(
                user_id=test_user["user"].id,
                exercise_id=exercise.id,
                score=80 + i,
                count=10 + i,
                duration=60 + i,
            )
            for i in range(3)
        ]
        db_session.add_all(records)
        db_session.commit()

        record_ids = [r.id for r in records]

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.delete(
            f"/api/exercise/records?"
            f"record_ids={record_ids[0]}&"
            f"record_ids={record_ids[1]}&"
            f"record_ids={record_ids[2]}",
            headers=headers,
        )
        assert response.status_code == status.HTTP_200_OK
        assert f"成功删除 {len(record_ids)} 条记录" in response.json()["message"]

        # 验证记录已被删除
        remaining = (
            db_session.query(ExerciseRecord)
            .filter(ExerciseRecord.id.in_(record_ids))
            .all()
        )
        assert len(remaining) == 0

    def test_batch_delete_partial_success(self, client, db_session, test_user):
        """测试批量删除部分记录（包含其他用户的记录）"""
        from app.models.exercise import Exercise, ExerciseRecord
        from app.models.user import User

        # 创建另一个用户
        other_user = User(
            username="other_user2",
            email="other2@example.com",
            password_hash="hashed",
            is_active=True,
        )
        db_session.add(other_user)
        db_session.commit()

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        # 创建当前用户的记录
        record1 = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
        )
        db_session.add(record1)

        # 创建其他用户的记录
        record2 = ExerciseRecord(
            user_id=other_user.id,
            exercise_id=exercise.id,
            score=85,
            count=15,
            duration=90,
        )
        db_session.add(record2)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        # 尝试删除两条记录（其中一条属于其他用户）
        response = client.delete(
            f"/api/exercise/records?record_ids={record1.id}&record_ids={record2.id}",
            headers=headers,
        )
        assert response.status_code == status.HTTP_200_OK

        # 只删除了当前用户的记录
        remaining = db_session.query(ExerciseRecord).filter_by(id=record2.id).first()
        assert remaining is not None

    def test_inactive_user_cannot_batch_delete_records(
        self, client, db_session, inactive_test_user
    ):
        """测试已注销账户无法批量删除记录"""
        headers = {"Authorization": f"Bearer {inactive_test_user['token']}"}
        response = client.delete(
            "/api/exercise/records?record_ids=1&record_ids=2", headers=headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_batch_delete_records_removes_video_files(
        self, client, db_session, test_user, tmp_path
    ):
        """测试批量删除时清理关联视频文件"""
        from app.models.exercise import Exercise, ExerciseRecord
        from unittest.mock import patch

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        video_one = upload_dir / "batch-1.mp4"
        video_two = upload_dir / "batch-2.mp4"
        video_one.write_bytes(b"video one")
        video_two.write_bytes(b"video two")

        record1 = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
            video_url="/videos/batch-1.mp4",
        )
        record2 = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=85,
            count=15,
            duration=90,
            video_url="/videos/batch-2.mp4",
        )
        db_session.add_all([record1, record2])
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.delete(
                f"/api/exercise/records?record_ids={record1.id}&record_ids={record2.id}",
                headers=headers,
            )

        assert response.status_code == status.HTTP_200_OK
        assert not video_one.exists()
        assert not video_two.exists()

    def test_delete_record_cleanup_failure_keeps_database_deleted(
        self, client, db_session, test_user
    ):
        """文件清理失败不得让数据库继续引用待删除记录。"""
        from app.models.exercise import Exercise, ExerciseRecord
        from unittest.mock import patch

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        record = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
            video_url="/videos/record-delete.mp4",
        )
        db_session.add(record)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        with patch(
            "app.api.exercise.delete_video_urls", side_effect=OSError("disk busy")
        ):
            response = client.delete(
                f"/api/exercise/records/{record.id}",
                headers=headers,
            )

        assert response.status_code == status.HTTP_200_OK
        assert db_session.query(ExerciseRecord).filter_by(id=record.id).first() is None

    def test_batch_delete_cleanup_failure_keeps_database_deleted(
        self, client, db_session, test_user
    ):
        """批量文件清理失败时，数据库删除仍应保持提交。"""
        from app.models.exercise import Exercise, ExerciseRecord
        from unittest.mock import patch

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        records = [
            ExerciseRecord(
                user_id=test_user["user"].id,
                exercise_id=exercise.id,
                score=80 + i,
                count=10 + i,
                duration=60 + i,
                video_url=f"/videos/batch-{i}.mp4",
            )
            for i in range(2)
        ]
        db_session.add_all(records)
        db_session.commit()
        record_ids = [record.id for record in records]

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        with patch(
            "app.api.exercise.delete_video_urls", side_effect=OSError("disk busy")
        ):
            response = client.delete(
                f"/api/exercise/records?record_ids={record_ids[0]}&record_ids={record_ids[1]}",
                headers=headers,
            )

        assert response.status_code == status.HTTP_200_OK
        remaining = (
            db_session.query(ExerciseRecord)
            .filter(ExerciseRecord.id.in_(record_ids))
            .all()
        )
        assert remaining == []
