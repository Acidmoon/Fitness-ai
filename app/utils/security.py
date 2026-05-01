# E:\Fitness-ai-backend\app\utils\security.py

from app.config import settings
import bcrypt
from datetime import datetime, timezone, timedelta
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User

# JWT 配置（从环境变量读取）
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
JWT_SUB_TYPE_USER_ID = "user_id"


def hash_password(password: str) -> str:
    """对密码进行加密"""
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码是否正确"""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )


# JWT 令牌
def create_access_token(data: dict, expires_delta: timedelta = None):
    """生成 JWT 令牌"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# 获取当前用户

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    """从 JWT 令牌获取当前用户（支持平滑迁移）"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub: str = payload.get("sub")
        sub_type: str | None = payload.get("sub_type")
        if sub is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    if sub_type == JWT_SUB_TYPE_USER_ID:
        if not sub.isdigit():
            raise credentials_exception
        user = db.query(User).filter(User.id == int(sub)).first()
    elif sub_type is None and sub.isdigit():
        # 兼容历史 token：允许旧版纯数字用户名和早期无类型 id token，
        # 但当两者指向不同用户时直接拒绝，避免身份串号。
        id_user = db.query(User).filter(User.id == int(sub)).first()
        username_user = db.query(User).filter(User.username == sub).first()
        if id_user and username_user and id_user.id != username_user.id:
            raise credentials_exception
        user = username_user or id_user
    elif sub_type is None:
        user = db.query(User).filter(User.username == sub).first()
    else:
        raise credentials_exception

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="账户已被注销"
        )

    return user
