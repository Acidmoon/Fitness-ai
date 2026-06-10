# E:\Fitness-ai-backend\app\api\auth.py

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.repositories import UserRepository, get_user_repo
from app.schemas.user import UserCreate, UserResponse, TokenWithRefresh, RefreshRequest
from app.utils.login_rate_limit import (
    build_login_rate_limit_scope,
    build_registration_rate_limit_scope,
    login_failure_limiter,
    registration_limiter,
)
from app.auth.jwt import (
    JWT_SUB_TYPE_USER_ID,
    JWT_SUB_TYPE_REFRESH,
    JWTError,
    create_access_token,
    create_refresh_token,
    decode_access_token,
)
from app.utils.security import (
    hash_password,
    verify_password,
)

router = APIRouter()


@router.post("/register", response_model=UserResponse)
def register(
    user_data: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    repo: UserRepository = Depends(get_user_repo),
):
    """用户注册"""
    rate_limit_scope = build_registration_rate_limit_scope(request)
    if registration_limiter.is_limited(rate_limit_scope):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="注册尝试过于频繁，请稍后再试",
        )
    registration_limiter.register_failure(rate_limit_scope)

    if repo.get_by_username(user_data.username):
        raise HTTPException(status_code=400, detail="用户名已存在")

    if repo.get_by_email(user_data.email):
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    db_user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=hash_password(user_data.password),
    )
    db.add(db_user)
    try:
        db.commit()
        db.refresh(db_user)
    except IntegrityError:
        db.rollback()
        registration_limiter.register_failure(rate_limit_scope)
        raise HTTPException(status_code=400, detail="用户名或邮箱已被使用")

    registration_limiter.clear_scope(rate_limit_scope)
    return db_user


@router.post("/login", response_model=TokenWithRefresh)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    repo: UserRepository = Depends(get_user_repo),
):
    """用户登录"""
    rate_limit_scope = build_login_rate_limit_scope(request, form_data.username)
    if login_failure_limiter.is_limited(rate_limit_scope):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录尝试过于频繁，请稍后再试",
        )

    user = repo.get_by_username(form_data.username)
    if not user or not verify_password(form_data.password, user.password_hash):
        login_failure_limiter.register_failure(rate_limit_scope)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="账户已被注销"
        )

    login_failure_limiter.clear_scope(rate_limit_scope)
    user_sub = str(user.id)
    access_token = create_access_token(
        data={"sub": user_sub, "sub_type": JWT_SUB_TYPE_USER_ID}
    )
    refresh_token = create_refresh_token(
        data={"sub": user_sub, "sub_type": JWT_SUB_TYPE_REFRESH}
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/refresh", response_model=TokenWithRefresh)
def refresh_token(
    refresh_data: RefreshRequest,
    repo: UserRepository = Depends(get_user_repo),
):
    """刷新访问令牌。

    使用有效的 refresh_token 换取新的 access_token + refresh_token（轮换）。
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="刷新令牌无效或已过期",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(refresh_data.refresh_token)
    except JWTError:
        raise credentials_exception

    if payload.get("sub_type") != JWT_SUB_TYPE_REFRESH:
        raise credentials_exception

    sub = payload.get("sub")
    if not sub or not str(sub).isdigit():
        raise credentials_exception

    user = repo.get_by_id(int(sub))
    if not user or not user.is_active:
        raise credentials_exception

    user_sub = str(user.id)
    new_access_token = create_access_token(
        data={"sub": user_sub, "sub_type": JWT_SUB_TYPE_USER_ID}
    )
    new_refresh_token = create_refresh_token(
        data={"sub": user_sub, "sub_type": JWT_SUB_TYPE_REFRESH}
    )

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
    }
