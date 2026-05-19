"""JWT token creation and decoding."""

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from app.config import settings

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
JWT_SUB_TYPE_USER_ID = "user_id"


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """生成 JWT 令牌。"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> dict:
    """解码 JWT 令牌，失败时抛出 JWTError。"""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


__all__ = [
    "JWT_SUB_TYPE_USER_ID",
    "JWTError",
    "create_access_token",
    "decode_access_token",
]
