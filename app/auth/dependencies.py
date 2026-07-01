"""FastAPI authentication dependencies."""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.auth.jwt import JWT_SUB_TYPE_REFRESH, JWT_SUB_TYPE_USER_ID, decode_access_token
from app.database import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    """从 JWT 令牌获取当前用户（支持平滑迁移）。"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(token)
        sub: str = payload.get("sub")
        sub_type: str | None = payload.get("sub_type")
        if sub is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    if sub_type == JWT_SUB_TYPE_REFRESH:
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
