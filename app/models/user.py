# E:\Fitness-ai-backend\app\models\user.py
from sqlalchemy.orm import relationship
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from app.database import Base
from app.utils.datetime import utc_now


class User(Base):
    """用户数据模型"""

    __tablename__ = "users"  # 数据库表名
    records = relationship(
        "ExerciseRecord", back_populates="user", cascade="all, delete-orphan"
    )

    id = Column(Integer, primary_key=True, index=True)  # 主键
    username = Column(String(50), unique=True, index=True, nullable=False)  # 用户名
    email = Column(String(100), unique=True, index=True, nullable=False)  # 邮箱
    password_hash = Column(String(255), nullable=False)  # 加密后的密码
    is_active = Column(Boolean, default=True)  # 账户是否激活
    created_at = Column(DateTime, default=utc_now)  # 统一使用 UTC 语义
    updated_at = Column(
        DateTime,
        default=utc_now,
        onupdate=utc_now,
    )  # 修改

    def __repr__(self):
        return f"<User {self.username}>"
