import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault(
    "SECRET_KEY", "test-secret-key-for-pytest-not-for-production-use-123456"
)

from app.database import Base, enable_sqlite_foreign_keys, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.utils.login_rate_limit import clear_all_login_rate_limits  # noqa: E402
from app.utils.security import hash_password  # noqa: E402

# 使用 SQLite 内存数据库进行测试（无需 PostgreSQL）
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
enable_sqlite_foreign_keys(engine)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """创建数据库表并返回会话"""
    clear_all_login_rate_limits()
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
        clear_all_login_rate_limits()


@pytest.fixture(scope="function")
def client(db_session):
    """创建测试客户端"""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def test_user(client, db_session):
    """创建测试用户并返回认证 token"""
    from app.models.user import User

    user = User(
        username="testuser",
        email="test@example.com",
        password_hash=hash_password("password123"),
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    # 登录获取 token
    response = client.post(
        "/api/auth/login", data={"username": "testuser", "password": "password123"}
    )
    token = response.json()["access_token"]
    return {"token": token, "user": user}


@pytest.fixture(scope="function")
def inactive_test_user(client, db_session):
    """创建已注销状态的测试用户并返回认证 token"""
    from app.models.user import User

    user = User(
        username="inactiveuser",
        email="inactive@example.com",
        password_hash=hash_password("password123"),
        is_active=False,
    )
    db_session.add(user)
    db_session.commit()

    from app.utils.security import create_access_token

    token = create_access_token({"sub": str(user.id)})
    return {"token": token, "user": user}


@pytest.fixture(scope="function")
def legacy_numeric_username_user(client, db_session):
    """创建历史纯数字用户名用户并返回认证 token"""
    from app.models.user import User

    user = User(
        username="123456",
        email="legacy-numeric@example.com",
        password_hash=hash_password("password123"),
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    from app.utils.security import create_access_token

    token = create_access_token({"sub": user.username})
    return {"token": token, "user": user}


# pytest-asyncio 配置
@pytest.fixture(scope="session")
def event_loop():
    """创建事件循环"""
    import asyncio

    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()
