# E:\Fitness-ai-backend\app\schemas\user.py

from pydantic import BaseModel, field_validator, ConfigDict
from datetime import datetime
from typing import Optional
import re


def _validate_username(v: str, allow_numeric_only: bool = False) -> str:
    """用户名格式校验"""
    if len(v) < 3 or len(v) > 50:
        raise ValueError("用户名长度 3-50 个字符")
    if not re.match(r"^[a-zA-Z0-9_]+$", v):
        raise ValueError("用户名只能包含字母、数字和下划线")
    if not allow_numeric_only and v.isdigit():
        raise ValueError("用户名不能为纯数字")
    return v


def _validate_email(v: str) -> str:
    """邮箱格式校验"""
    if not re.match(r"^[\w\.-]+@[\w\.-]+\.\w+$", v):
        raise ValueError("无效的邮箱格式")
    return v


def _validate_password(v: str) -> str:
    """密码强度校验"""
    if len(v) < 8:
        raise ValueError("密码至少 8 个字符")
    if not re.search(r"[A-Za-z]", v):
        raise ValueError("密码必须包含字母")
    if not re.search(r"\d", v):
        raise ValueError("密码必须包含数字")
    return v


# 用户注册请求
class UserCreate(BaseModel):
    username: str
    email: str
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v):
        return _validate_username(v)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        return _validate_email(v)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        return _validate_password(v)


# 用户登录请求
class UserLogin(BaseModel):
    username: str
    password: str


# 用户响应（不包含密码）
class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Token 响应
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenWithRefresh(Token):
    refresh_token: str


class RefreshRequest(BaseModel):
    refresh_token: str


# 更新用户资料请求
class UserProfileUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None

    @field_validator("username")
    @classmethod
    def validate_username(cls, v):
        if v is not None:
            return _validate_username(v, allow_numeric_only=True)
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if v is not None:
            return _validate_email(v)
        return v


# 修改密码请求
class PasswordChange(BaseModel):
    old_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v):
        return _validate_password(v)


# 注销账户请求
class AccountDelete(BaseModel):
    password: str  # 强制要求密码确认
