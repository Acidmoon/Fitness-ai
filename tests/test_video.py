from fastapi import status
from io import BytesIO
from unittest.mock import patch

VALID_MP4_BYTES = (
    b"\x00\x00\x00\x20ftypmp42" b"\x00\x00\x00\x00" b"mp42isom" b"\x00\x00\x00\x08mdat"
)


def make_mp4_file(name: str = "test.mp4", content: bytes = VALID_MP4_BYTES) -> BytesIO:
    video_content = BytesIO(content)
    video_content.name = name
    return video_content


class TestVideoUpload:
    """视频上传接口测试"""

    def test_upload_video_requires_auth(self, client, db_session):
        """测试上传视频需要认证"""
        response = client.post("/api/video/records/1/video")
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
        video_content = make_mp4_file()

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

        video_content = make_mp4_file()

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
        video_content = make_mp4_file()

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

        video_content = make_mp4_file()

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

        video_content = make_mp4_file()

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

    def test_temporary_upload_preserves_existing_stored_video(
        self, client, db_session, test_user, tmp_path
    ):
        """测试临时上传不会删除记录原有的永久视频"""
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        old_filename = "existing-video.mp4"
        old_file = upload_dir / old_filename
        old_file.write_bytes(b"stored video content")

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

        video_content = make_mp4_file("temp.mp4")
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.post(
                f"/api/video/records/{record.id}/video?keep_video=false",
                headers=headers,
                files={"video": ("temp.mp4", video_content, "video/mp4")},
            )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["video_deleted"] is True
        assert data["video_url"] is None
        assert old_file.exists()

        db_session.refresh(record)
        assert record.video_url == f"/videos/{old_filename}"
        assert [path.name for path in upload_dir.iterdir()] == [old_filename]

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

        video_content = make_mp4_file()

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
        """替换视频会删除旧文件，并使旧视频派生的 AI 结果失效。"""
        from app.models.exercise import Exercise, ExerciseRecord
        from app.models.pose_analysis_job import PoseAnalysisJob
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
            manual_score=80,
            manual_count=10,
            score_source="ai",
            count_source="ai",
            duration=60,
            video_url=f"/videos/{old_filename}",
            video_revision=0,
            keypoints_data={"status": "done", "frames": []},
            analysis_revision=0,
            analysis_model="MoveNet",
            analysis_rule_version="pushup-v1",
            feedback="旧视频反馈",
        )
        db_session.add(record)
        db_session.commit()
        job = PoseAnalysisJob(
            record_id=record.id,
            user_id=test_user["user"].id,
            status="running",
            video_revision=0,
        )
        db_session.add(job)
        db_session.commit()

        video_content = make_mp4_file()
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
        db_session.refresh(record)
        db_session.refresh(job)
        assert record.video_revision == 1
        assert record.keypoints_data is None
        assert record.analysis_revision is None
        assert record.analysis_model is None
        assert record.analysis_rule_version is None
        assert record.feedback is None
        assert record.score == 80
        assert record.count == 10
        assert record.score_source == "manual"
        assert record.count_source == "manual"
        assert job.status == "cancelled"

    def test_upload_video_replacement_cleanup_failure_keeps_new_reference(
        self, client, db_session, test_user, tmp_path
    ):
        """测试替换旧视频后清理失败不会回滚新引用"""
        from app.models.exercise import Exercise, ExerciseRecord

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

        video_content = make_mp4_file()
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        def failing_cleanup(video_url):
            if video_url == f"/videos/{old_filename}":
                raise OSError("cleanup failed")
            return "deleted"

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)), patch(
            "app.api.video.delete_video_file", side_effect=failing_cleanup
        ):
            response = client.post(
                f"/api/video/records/{record.id}/video?keep_video=true",
                headers=headers,
                files={"video": ("test.mp4", video_content, "video/mp4")},
            )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["video_url"] != f"/videos/{old_filename}"
        assert old_file.exists()
        db_session.refresh(record)
        assert record.video_url == data["video_url"]

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
        oversized_content = make_mp4_file("oversized.mp4", VALID_MP4_BYTES + b"a" * 32)
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

    def test_upload_video_rejects_mismatched_mime_type(
        self, client, db_session, test_user, tmp_path
    ):
        """测试扩展名与 MIME 类型不匹配时拒绝上传"""
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

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        video_content = make_mp4_file()

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.post(
                f"/api/video/records/{record.id}/video",
                headers=headers,
                files={"video": ("test.mp4", video_content, "text/plain")},
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "MIME" in response.json()["detail"]
        assert list(upload_dir.iterdir()) == []

    def test_upload_video_rejects_disguised_non_video_content(
        self, client, db_session, test_user, tmp_path
    ):
        """测试伪装成视频扩展名的非视频内容会被拒绝"""
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

        video_content = BytesIO(b"plain text payload")
        video_content.name = "test.mp4"
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.post(
                f"/api/video/records/{record.id}/video",
                headers=headers,
                files={"video": ("test.mp4", video_content, "video/mp4")},
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "内容与扩展名不匹配" in response.json()["detail"]
        assert list(upload_dir.iterdir()) == []

    def test_upload_video_accepts_supported_signature(
        self, client, db_session, test_user, tmp_path
    ):
        """测试受支持的视频签名可以通过校验"""
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

        video_content = make_mp4_file()
        headers = {"Authorization": f"Bearer {test_user['token']}"}

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.post(
                f"/api/video/records/{record.id}/video",
                headers=headers,
                files={
                    "video": ("test.mp4", video_content, "application/octet-stream")
                },
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["video_deleted"] is False

    def test_upload_video_cleans_partial_file_on_write_failure(
        self, client, db_session, test_user, tmp_path
    ):
        """测试写入中途失败时清理部分文件"""
        from app.models.exercise import Exercise, ExerciseRecord
        from app.api import video as video_api

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
            def __init__(self, content: bytes):
                self._buffer = BytesIO(content)
                self._stream_reads = 0
                self._streaming_started = False

            def read(self, size=-1):
                if self._streaming_started:
                    self._stream_reads += 1
                    if self._stream_reads == 2:
                        raise OSError("disk write interrupted")
                return self._buffer.read(size)

            def seek(self, offset, whence=0):
                result = self._buffer.seek(offset, whence)
                if offset == 0 and whence == 0:
                    self._streaming_started = True
                return result

            def tell(self):
                return self._buffer.tell()

        failing_upload = type(
            "FailingUpload",
            (),
            {
                "filename": "broken.mp4",
                "content_type": "video/mp4",
                "file": FailingFile(VALID_MP4_BYTES + b"abcdefghijk"),
            },
        )()

        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)), patch(
            "app.utils.video_files.UPLOAD_CHUNK_SIZE", 8
        ):
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
        response = client.delete("/api/video/records/1/video")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_delete_video_success(self, client, db_session, test_user, tmp_path):
        """删除视频会清理引用，并失效该视频对应的分析结果和活动任务。"""
        from app.models.exercise import Exercise, ExerciseRecord
        from app.models.pose_analysis_job import PoseAnalysisJob
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
            manual_score=76,
            manual_count=8,
            score_source="ai",
            count_source="ai",
            duration=60,
            video_url="/videos/test.mp4",
            video_revision=2,
            keypoints_data={"status": "done", "frames": []},
            analysis_revision=2,
            analysis_model="MoveNet",
            feedback="旧视频反馈",
        )
        db_session.add(record)
        db_session.commit()
        job = PoseAnalysisJob(
            record_id=record.id,
            user_id=test_user["user"].id,
            status="queued",
            video_revision=2,
        )
        db_session.add(job)
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
        db_session.refresh(job)
        assert record.video_url is None
        assert record.video_revision == 3
        assert record.keypoints_data is None
        assert record.analysis_revision is None
        assert record.score == 76
        assert record.count == 8
        assert record.score_source == "manual"
        assert record.count_source == "manual"
        assert record.feedback is None
        assert job.status == "cancelled"
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

    def test_delete_video_missing_file_still_clears_reference(
        self, client, db_session, test_user, tmp_path
    ):
        """测试磁盘文件缺失时仍可清理数据库引用"""
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()

        record = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
            video_url="/videos/missing.mp4",
        )
        db_session.add(record)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.delete(
                f"/api/video/records/{record.id}/video", headers=headers
            )

        assert response.status_code == status.HTTP_200_OK
        db_session.refresh(record)
        assert record.video_url is None

    def test_delete_video_cleanup_failure_still_clears_reference(
        self, client, db_session, test_user, tmp_path
    ):
        """磁盘清理失败时仍清除数据库引用，避免继续暴露失效视频。"""
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()

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
        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)), patch(
            "app.api.video.delete_video_file", side_effect=OSError("disk busy")
        ):
            response = client.delete(
                f"/api/video/records/{record.id}/video", headers=headers
            )

        assert response.status_code == status.HTTP_200_OK
        db_session.refresh(record)
        assert record.video_url is None


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
