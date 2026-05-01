# E:\Fitness-ai-backend\app\models\exercise.py

from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.database import Base
from app.utils.datetime import utc_now


class Exercise(Base):
    """标准动作库"""

    __tablename__ = "exercises"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)  # 如"标准俯卧撑"
    category = Column(String(50))  # 上肢/下肢/核心
    description = Column(Text, nullable=True)  # 动作描述
    standard = Column(JSON, nullable=True)  # 动作标准{关节角度，次数要求等}
    created_at = Column(DateTime, default=utc_now)  # 统一使用 UTC 语义

    # 关系
    records = relationship("ExerciseRecord", back_populates="exercise")


class ExerciseRecord(Base):
    """运动记录"""

    __tablename__ = "records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    exercise_id = Column(Integer, ForeignKey("exercises.id"), nullable=False)
    score = Column(Float)  # 动作评分 0-100
    count = Column(Integer)  # 完成次数
    duration = Column(Integer)  # 时长 (秒)
    heart_rate_avg = Column(Float, nullable=True)  # 平均心率
    heart_rate_max = Column(Float, nullable=True)  # 最大心率
    video_url = Column(String(255), nullable=True)  # 视频存储路径
    keypoints_data = Column(JSON, nullable=True)  # 关键点数据
    feedback = Column(Text, nullable=True)  # AI 纠错建议
    created_at = Column(DateTime, default=utc_now, index=True)  # 统一使用 UTC 语义

    # 关系
    user = relationship("User", back_populates="records")
    exercise = relationship("Exercise", back_populates="records")
