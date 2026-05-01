from fastapi import status
from io import BytesIO
from unittest.mock import patch


class TestVideoUpload:
    """视频上传接口测试"""

    def test_upload_video_requires_auth(self, client, db_session):
        """测试上传视频需要认证"""
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        record = ExerciseRecord(
            user_id=1, exercise_id=exercise.id, score=80, count=10, duration=60
        )
        db_session.add(record)
        db_session.commit()

        response = client.post(f"/api/video/records/{record.id}/video")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_upload_video_success(self, client, db_session, test_user, tmp_path):
        """测试上传视频成功"""
        from app.models.exercise import Exercise, ExerciseRecord
        from unittest.mock import patch

        # 创建测试记录
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

        # 临时上传目录
        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()

        # 模拟视频文件
        video_content = BytesIO(b"fake video content")
        video_content.name = "test.mp4"

        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.post(
                f"/api/video/records/{record.id}/video",
                headers=headers,
                files={"video": ("test.mp4", video_content, "video/mp4")},
            )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["message"] == "视频上传成功"
        assert data["video_deleted"] is False

    def test_upload_video_invalid_format(self, client, db_session, test_user, tmp_path):
        """测试上传不支持的视频格式"""
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

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()

        # 尝试上传 txt 文件
        txt_content = BytesIO(b"text content")
        txt_content.name = "test.txt"

        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.post(
                f"/api/video/records/{record.id}/video",
                headers=headers,
                files={"video": ("test.txt", txt_content, "text/plain")},
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "不支持的视频格式" in response.json()["detail"]

    def test_upload_video_record_not_found(
        self, client, db_session, test_user, tmp_path
    ):
        """测试运动记录不存在"""

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()

        video_content = BytesIO(b"fake video content")
        video_content.name = "test.mp4"

        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.post(
                "/api/video/records/9999/video",
                headers=headers,
                files={"video": ("test.mp4", video_content, "video/mp4")},
            )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "运动记录不存在" in response.json()["detail"]

    def test_inactive_user_cannot_upload_video(
        self, client, db_session, inactive_test_user, tmp_path
    ):
        """测试已注销账户无法上传视频"""

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        video_content = BytesIO(b"fake video content")
        video_content.name = "test.mp4"

        headers = {"Authorization": f"Bearer {inactive_test_user['token']}"}
        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.post(
                "/api/video/records/1/video",
                headers=headers,
                files={"video": ("test.mp4", video_content, "video/mp4")},
            )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_upload_video_keep_false(self, client, db_session, test_user, tmp_path):
        """测试临时上传模式（不保留视频）"""
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

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()

        video_content = BytesIO(b"fake video content")
        video_content.name = "test.mp4"

        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.post(
                f"/api/video/records/{record.id}/video",
                headers=headers,
                files={"video": ("test.mp4", video_content, "video/mp4")},
            )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        # 默认 keep_video=True，所以 video_deleted 应该为 False
        assert data["video_deleted"] is False
        assert "永久存储" in data["note"]

    def test_upload_video_keep_video_false(
        self, client, db_session, test_user, tmp_path
    ):
        """测试 keep_video=False 时真正删除临时文件"""
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

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()

        video_content = BytesIO(b"fake video content")
        video_content.name = "test.mp4"

        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.post(
                f"/api/video/records/{record.id}/video?keep_video=false",
                headers=headers,
                files={"video": ("test.mp4", video_content, "video/mp4")},
            )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        # keep_video=False，视频应该被删除
        assert data["video_deleted"] is True
        assert data["video_url"] is None
        assert "临时分析" in data["note"]
        # 目录应为空，说明临时文件已删除
        assert len(list(upload_dir.iterdir())) == 0

    def test_upload_video_keep_video_true_explicit(
        self, client, db_session, test_user, tmp_path
    ):
        """测试 keep_video=True 时保留文件"""
        from app.models.exercise import Exercise, ExerciseRecord
        import os

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

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()

        video_content = BytesIO(b"fake video content")
        video_content.name = "test.mp4"

        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.post(
                f"/api/video/records/{record.id}/video?keep_video=true",
                headers=headers,
                files={"video": ("test.mp4", video_content, "video/mp4")},
            )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        # keep_video=True，视频应该保留
        assert data["video_deleted"] is False
        assert data["video_url"] is not None
        assert "永久存储" in data["note"]
        # 验证文件确实存在（通过 video_url 查找）
        filename = data["video_url"].split("/")[-1]
        assert os.path.exists(upload_dir / filename)

    def test_upload_video_replaces_previous_file(
        self, client, db_session, test_user, tmp_path
    ):
        """测试重新上传会删除旧文件"""
        from app.models.exercise import Exercise, ExerciseRecord
        import os

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        old_filename = "old-video.mp4"
        old_file = upload_dir / old_filename
        old_file.write_bytes(b"old video content")

        record = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
            video_url=f"/videos/{old_filename}",
        )
        db_session.add(record)
        db_session.commit()

        video_content = BytesIO(b"new fake video content")
        video_content.name = "test.mp4"
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.post(
                f"/api/video/records/{record.id}/video?keep_video=true",
                headers=headers,
                files={"video": ("test.mp4", video_content, "video/mp4")},
            )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["video_url"] != f"/videos/{old_filename}"
        assert not os.path.exists(old_file)
        new_filename = data["video_url"].split("/")[-1]
        assert os.path.exists(upload_dir / new_filename)

    def test_upload_video_rejects_oversize_during_stream(
        self, client, db_session, test_user, tmp_path
    ):
        """测试流式写入中超限会报错并清理部分文件"""
        from app.models.exercise import Exercise, ExerciseRecord
        from app.utils import video_files

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

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()

        original_chunk_size = video_files.UPLOAD_CHUNK_SIZE
        oversized_content = BytesIO(b"a" * 5)
        oversized_content.name = "oversized.mp4"
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)), patch(
            "app.utils.video_files.UPLOAD_CHUNK_SIZE", 2
        ), patch("app.api.video.MAX_FILE_SIZE", 4):
            response = client.post(
                f"/api/video/records/{record.id}/video",
                headers=headers,
                files={"video": ("oversized.mp4", oversized_content, "video/mp4")},
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "文件大小超过 50MB 限制" in response.json()["detail"]
        assert list(upload_dir.iterdir()) == []
        assert video_files.UPLOAD_CHUNK_SIZE == original_chunk_size

    def test_upload_video_cleans_partial_file_on_write_failure(
        self, client, db_session, test_user, tmp_path
    ):
        """测试写入中途失败时清理部分文件"""
        from app.models.exercise import Exercise, ExerciseRecord
        from app.api import video as video_api
        from app.utils.video_files import UPLOAD_CHUNK_SIZE

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

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()

        class FailingFile:
            def __init__(self):
                self._reads = 0

            def read(self, _size):
                self._reads += 1
                if self._reads == 1:
                    return b"a" * min(UPLOAD_CHUNK_SIZE, 8)
                raise OSError("disk write interrupted")

            def seek(self, *_args):
                return 0

        failing_upload = type(
            "FailingUpload", (), {"filename": "broken.mp4", "file": FailingFile()}
        )()

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            try:
                video_api.upload_video(
                    record_id=record.id,
                    video=failing_upload,
                    keep_video=True,
                    db=db_session,
                    current_user=test_user["user"],
                )
            except OSError:
                pass
            else:
                raise AssertionError("Expected OSError during upload write")

        assert list(upload_dir.iterdir()) == []
        db_session.refresh(record)
        assert record.video_url is None


class TestVideoDelete:
    """视频删除接口测试"""

    def test_delete_video_requires_auth(self, client, db_session):
        """测试删除视频需要认证"""
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        record = ExerciseRecord(
            user_id=1,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
            video_url="/videos/test.mp4",
        )
        db_session.add(record)
        db_session.commit()

        response = client.delete(f"/api/video/records/{record.id}/video")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_delete_video_success(self, client, db_session, test_user, tmp_path):
        """测试删除视频成功"""
        from app.models.exercise import Exercise, ExerciseRecord
        import os

        # 创建测试记录并关联视频
        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        # 创建临时视频文件
        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        test_video_path = upload_dir / "test.mp4"
        test_video_path.write_bytes(b"fake video content")

        record = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
            video_url="/videos/test.mp4",
        )
        db_session.add(record)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.delete(
                f"/api/video/records/{record.id}/video", headers=headers
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["message"] == "视频已删除"

        # 验证数据库中的视频路径已清空
        db_session.refresh(record)
        assert record.video_url is None
        assert not os.path.exists(test_video_path)

    def test_delete_video_no_video(self, client, db_session, test_user):
        """测试删除没有视频的记录"""
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
            video_url=None,
        )
        db_session.add(record)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.delete(
            f"/api/video/records/{record.id}/video", headers=headers
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "该记录没有关联视频" in response.json()["detail"]

    def test_delete_video_record_not_found(self, client, db_session, test_user):
        """测试删除不存在的记录"""
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.delete("/api/video/records/9999/video", headers=headers)

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "运动记录不存在" in response.json()["detail"]

    def test_inactive_user_cannot_delete_video(
        self, client, db_session, inactive_test_user
    ):
        """测试已注销账户无法删除视频"""
        headers = {"Authorization": f"Bearer {inactive_test_user['token']}"}
        response = client.delete("/api/video/records/1/video", headers=headers)

        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestVideoAccess:
    """视频访问接口测试"""

    def test_get_video_requires_auth(self, client, db_session):
        """测试访问视频需要认证"""
        response = client.get("/api/video/videos/test.mp4")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_video_not_found(self, client, db_session, test_user, tmp_path):
        """测试访问不存在的视频"""

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()

        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.get("/api/video/videos/nonexistent.mp4", headers=headers)

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "视频文件不存在" in response.json()["detail"]

    def test_get_video_forbidden_other_user(
        self, client, db_session, test_user, tmp_path
    ):
        """测试不能访问其他用户的视频"""
        from app.models.exercise import Exercise, ExerciseRecord
        from app.models.user import User
        from app.utils.security import hash_password

        other_user = User(
            username="video_owner",
            email="video_owner@example.com",
            password_hash=hash_password("password123"),
            is_active=True,
        )
        db_session.add(other_user)
        db_session.commit()

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        filename = "owner_video.mp4"
        (upload_dir / filename).write_bytes(b"fake video content")

        record = ExerciseRecord(
            user_id=other_user.id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
            video_url=f"/videos/{filename}",
        )
        db_session.add(record)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.get(f"/api/video/videos/{filename}", headers=headers)

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "视频文件不存在" in response.json()["detail"]

    def test_inactive_user_cannot_access_video(
        self, client, db_session, inactive_test_user
    ):
        """测试已注销账户无法访问视频"""
        headers = {"Authorization": f"Bearer {inactive_test_user['token']}"}
        response = client.get("/api/video/videos/test.mp4", headers=headers)

        assert response.status_code == status.HTTP_403_FORBIDDEN
