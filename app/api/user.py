# E:\Fitness-ai-backend\app\api\user.py

from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    UserProfileUpdate,
    PasswordChange,
    AccountDelete,
    UserResponse,
)
from app.utils.security import get_current_user, verify_password, hash_password
from app.utils.video_files import delete_video_urls

router = APIRouter()


@router.get("/profile", response_model=UserResponse)
def get_profile(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """获取当前用户资料"""
    return current_user


@router.put("/profile", response_model=UserResponse)
def update_profile(
    profile_data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """更新当前用户资料"""
    # 更新用户名
    if profile_data.username is not None:
        if (
            profile_data.username.isdigit()
            and profile_data.username != current_user.username
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="用户名不能为纯数字",
            )
        existing_user = (
            db.query(User)
            .filter(User.username == profile_data.username, User.id != current_user.id)
            .first()
        )
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="用户名已被使用"
            )
        current_user.username = profile_data.username

    # 更新邮箱
    if profile_data.email is not None:
        existing_email = (
            db.query(User)
            .filter(User.email == profile_data.email, User.id != current_user.id)
            .first()
        )
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱已被使用"
            )
        current_user.email = profile_data.email

    try:
        db.commit()
        db.refresh(current_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="用户名或邮箱已被使用"
        )

    return current_user


@router.put("/password")
def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """修改当前用户密码"""
    if not verify_password(password_data.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="原密码错误"
        )

    current_user.password_hash = hash_password(password_data.new_password)
    db.commit()

    return {"message": "密码修改成功"}


@router.delete("/account")
def delete_account(
    delete_data: AccountDelete,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """注销当前账户（硬删除）"""
    if delete_data.password is not None:
        if not verify_password(delete_data.password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="密码错误"
            )

    video_urls = [record.video_url for record in current_user.records]
    user_id = current_user.id
    db.delete(current_user)
    db.commit()
    try:
        delete_video_urls(video_urls)
    except OSError as exc:
        logger.warning("User {} deleted but video cleanup failed: {}", user_id, exc)

    return {"message": "账户已注销"}
