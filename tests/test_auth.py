from fastapi import status
from jose import jwt
from app.config import settings
from app.utils.security import JWT_SUB_TYPE_USER_ID, create_access_token


class TestRegister:
    """用户注册测试"""

    def test_register_success(self, client, db_session):
        """测试正常注册"""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "new@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["username"] == "newuser"
        assert data["email"] == "new@example.com"
        assert "id" in data

    def test_register_duplicate_username(self, client, db_session, test_user):
        """测试用户名重复"""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "testuser",
                "email": "different@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "用户名已存在" in response.json()["detail"]

    def test_register_duplicate_email(self, client, db_session, test_user):
        """测试邮箱重复"""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "differentuser",
                "email": "test@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "邮箱已被注册" in response.json()["detail"]

    def test_register_password_too_short(self, client, db_session):
        """测试密码太短"""
        response = client.post(
            "/api/auth/register",
            json={"username": "newuser", "email": "new@example.com", "password": "123"},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_register_password_no_letter(self, client, db_session):
        """测试密码没有字母"""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "new@example.com",
                "password": "12345678",
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_register_password_no_digit(self, client, db_session):
        """测试密码没有数字"""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "new@example.com",
                "password": "abcdefgh",
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_register_username_too_short(self, client, db_session):
        """测试用户名太短"""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "ab",
                "email": "new@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_register_username_too_long(self, client, db_session):
        """测试用户名太长"""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "a" * 51,
                "email": "new@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_register_username_invalid_chars(self, client, db_session):
        """测试用户名包含非法字符"""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "new user!",
                "email": "new@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_register_username_numeric_only(self, client, db_session):
        """测试用户名不能为纯数字"""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "123456",
                "email": "new@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_register_invalid_email(self, client, db_session):
        """测试邮箱格式无效"""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "invalid-email",
                "password": "password123",
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


class TestLogin:
    """用户登录测试"""

    def test_login_success(self, client, db_session, test_user):
        """测试正常登录"""
        response = client.post(
            "/api/auth/login", data={"username": "testuser", "password": "password123"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client, db_session, test_user):
        """测试密码错误"""
        response = client.post(
            "/api/auth/login",
            data={"username": "testuser", "password": "wrongpassword"},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_user_not_found(self, client, db_session):
        """测试用户不存在"""
        response = client.post(
            "/api/auth/login",
            data={"username": "nonexistent", "password": "password123"},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_token_uses_user_id(self, client, db_session, test_user):
        """测试登录 token 使用 user.id 作为 sub"""
        response = client.post(
            "/api/auth/login", data={"username": "testuser", "password": "password123"}
        )
        assert response.status_code == status.HTTP_200_OK
        token = response.json()["access_token"]
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        assert payload["sub"] == str(test_user["user"].id)
        assert payload["sub"].isdigit()
        assert payload["sub_type"] == JWT_SUB_TYPE_USER_ID

    def test_login_inactive_user_forbidden(self, client, db_session, inactive_test_user):
        """测试已注销账户不能登录拿到新 token"""
        response = client.post(
            "/api/auth/login",
            data={"username": "inactiveuser", "password": "password123"},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "账户已被注销" in response.json()["detail"]

    def test_token_migration_supports_both_id_and_username(
        self, client, db_session, test_user
    ):
        """测试平滑迁移：同时支持 id 和 username 的 token"""
        # 使用带显式类型的 id token（新格式）
        token_with_id = create_access_token(
            {"sub": str(test_user["user"].id), "sub_type": JWT_SUB_TYPE_USER_ID}
        )
        headers_id = {"Authorization": f"Bearer {token_with_id}"}
        response_id = client.get("/api/user/profile", headers=headers_id)
        assert response_id.status_code == status.HTTP_200_OK

        # 使用 username 创建 token（旧格式，兼容）
        token_with_username = create_access_token({"sub": test_user["user"].username})
        headers_username = {"Authorization": f"Bearer {token_with_username}"}
        response_username = client.get("/api/user/profile", headers=headers_username)
        assert response_username.status_code == status.HTTP_200_OK

    def test_token_migration_supports_numeric_legacy_username_without_id_collision(
        self, client, db_session
    ):
        """测试纯数字旧用户名 token 在无同 id 用户时仍可解析"""
        from app.models.user import User
        from app.utils.security import hash_password

        legacy_numeric_user = User(
            username="123456",
            email="numeric@example.com",
            password_hash=hash_password("password123"),
            is_active=True,
        )
        db_session.add(legacy_numeric_user)
        db_session.commit()

        token_with_numeric_username = create_access_token(
            {"sub": legacy_numeric_user.username}
        )
        headers = {"Authorization": f"Bearer {token_with_numeric_username}"}
        response = client.get("/api/user/profile", headers=headers)

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["username"] == legacy_numeric_user.username

    def test_token_migration_supports_untyped_legacy_id_without_collision(
        self, client, db_session, test_user
    ):
        """测试早期无类型 id token 在无碰撞时仍可解析"""
        token_with_untyped_id = create_access_token({"sub": str(test_user["user"].id)})
        headers = {"Authorization": f"Bearer {token_with_untyped_id}"}
        response = client.get("/api/user/profile", headers=headers)

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["username"] == test_user["user"].username

    def test_token_migration_rejects_ambiguous_numeric_subject_collision(
        self, client, db_session
    ):
        """测试无类型数字 sub 同时命中 id 和 username 且非同一用户时拒绝认证"""
        from app.models.user import User
        from app.utils.security import hash_password

        legacy_numeric_user = User(
            username="2",
            email="legacy2@example.com",
            password_hash=hash_password("password123"),
            is_active=True,
        )
        id_owner = User(
            username="id_owner",
            email="id-owner@example.com",
            password_hash=hash_password("password123"),
            is_active=True,
        )
        db_session.add_all([legacy_numeric_user, id_owner])
        db_session.commit()

        assert legacy_numeric_user.id == 1
        assert id_owner.id == 2

        ambiguous_token = create_access_token({"sub": "2"})
        headers = {"Authorization": f"Bearer {ambiguous_token}"}
        response = client.get("/api/user/profile", headers=headers)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
