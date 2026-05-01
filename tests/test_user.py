from fastapi import status


class TestGetProfile:
    """获取用户资料测试"""

    def test_get_profile_success(self, client, db_session, test_user):
        """测试获取资料成功"""
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.get("/api/user/profile", headers=headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["username"] == test_user["user"].username
        assert data["email"] == test_user["user"].email
        assert "updated_at" in data

    def test_get_profile_requires_auth(self, client, db_session):
        """测试获取资料需要认证"""
        response = client.get("/api/user/profile")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestUpdateProfile:
    """更新用户资料测试"""

    def test_update_profile_success(self, client, db_session, test_user):
        """测试更新资料成功"""
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.put(
            "/api/user/profile",
            headers=headers,
            json={"username": "new_username", "email": "new@example.com"},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["username"] == "new_username"
        assert data["email"] == "new@example.com"

    def test_update_profile_username_taken(self, client, db_session, test_user):
        """测试用户名已存在"""
        # 创建另一个用户
        from app.models.user import User
        from app.utils.security import hash_password

        other_user = User(
            username="other_user",
            email="other@example.com",
            password_hash=hash_password("password123"),
        )
        db_session.add(other_user)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.put(
            "/api/user/profile", headers=headers, json={"username": "other_user"}
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "用户名已被使用" in response.json()["detail"]

    def test_update_profile_email_taken(self, client, db_session, test_user):
        """测试邮箱已被使用"""
        from app.models.user import User
        from app.utils.security import hash_password

        other_user = User(
            username="other_user",
            email="other@example.com",
            password_hash=hash_password("password123"),
        )
        db_session.add(other_user)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.put(
            "/api/user/profile", headers=headers, json={"email": "other@example.com"}
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "邮箱已被使用" in response.json()["detail"]

    def test_update_profile_invalid_email(self, client, db_session, test_user):
        """测试无效邮箱格式"""
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.put(
            "/api/user/profile", headers=headers, json={"email": "invalid-email"}
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


class TestChangePassword:
    """修改密码测试"""

    def test_change_password_success(self, client, db_session, test_user):
        """测试修改密码成功"""
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.put(
            "/api/user/password",
            headers=headers,
            json={"old_password": "password123", "new_password": "newpass123"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["message"] == "密码修改成功"

    def test_change_password_wrong_old(self, client, db_session, test_user):
        """测试原密码错误"""
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.put(
            "/api/user/password",
            headers=headers,
            json={"old_password": "wrong_password", "new_password": "newpass123"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "原密码错误" in response.json()["detail"]

    def test_change_password_weak_new(self, client, db_session, test_user):
        """测试新密码强度不足"""
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.put(
            "/api/user/password",
            headers=headers,
            json={"old_password": "testpass123", "new_password": "123"},
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


class TestDeleteAccount:
    """注销账户测试"""

    def test_delete_account_success(self, client, db_session, test_user):
        """测试注销账户成功"""
        from app.models.user import User

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.request(
            "DELETE",
            "/api/user/account",
            headers=headers,
            json={"password": "password123"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["message"] == "账户已注销"

        # 验证用户已被删除
        deleted_user = (
            db_session.query(User).filter(User.id == test_user["user"].id).first()
        )
        assert deleted_user is None

    def test_delete_account_requires_auth(self, client, db_session):
        """测试注销账户需要认证"""
        response = client.request(
            "DELETE", "/api/user/account", json={"password": "password123"}
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_delete_account_wrong_password(self, client, db_session, test_user):
        """测试密码错误"""
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.request(
            "DELETE",
            "/api/user/account",
            headers=headers,
            json={"password": "wrong_password"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "密码错误" in response.json()["detail"]

    def test_delete_account_removes_video_files(
        self, client, db_session, test_user, tmp_path
    ):
        """测试注销账户时删除关联视频文件"""
        from app.models.exercise import Exercise, ExerciseRecord
        from unittest.mock import patch

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        upload_dir = tmp_path / "videos"
        upload_dir.mkdir()
        video_path = upload_dir / "account-video.mp4"
        video_path.write_bytes(b"video content")

        record = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=80,
            count=10,
            duration=60,
            video_url="/videos/account-video.mp4",
        )
        db_session.add(record)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        with patch("app.utils.video_files.UPLOAD_DIR", str(upload_dir)):
            response = client.request(
                "DELETE",
                "/api/user/account",
                headers=headers,
                json={"password": "password123"},
            )

        assert response.status_code == status.HTTP_200_OK
        assert not video_path.exists()
