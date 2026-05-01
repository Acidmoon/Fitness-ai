# E:\Fitness-ai-backend\app\schemas\exercise.py

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime, date


# 创建运动记录请求
class ExerciseRecordCreate(BaseModel):
    exercise_id: int
    score: float = Field(ge=0, le=100, description="动作评分 0-100")
    count: int = Field(ge=0, description="完成次数")
    duration: int = Field(ge=0, description="时长 (秒)")
    heart_rate_avg: Optional[float] = None
    heart_rate_max: Optional[float] = None
    keypoints_data: Optional[Dict[str, Any]] = None
    feedback: Optional[str] = None


# 运动记录响应
class ExerciseRecordResponse(BaseModel):
    id: int
    exercise_id: int
    score: float
    count: int
    duration: int
    heart_rate_avg: Optional[float]
    video_url: Optional[str]
    feedback: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# 标准动作响应
class ExerciseResponse(BaseModel):
    id: int
    name: str
    category: Optional[str]
    description: Optional[str]

    model_config = ConfigDict(from_attributes=True)


# 运动记录查询参数
class ExerciseRecordQuery(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    exercise_id: Optional[int] = None


# 更新运动记录请求
class ExerciseRecordUpdate(BaseModel):
    score: Optional[float] = Field(None, ge=0, le=100, description="动作评分 0-100")
    count: Optional[int] = Field(None, ge=0, description="完成次数")
    duration: Optional[int] = Field(None, ge=0, description="时长 (秒)")
    heart_rate_avg: Optional[float] = None
    heart_rate_max: Optional[float] = None
    keypoints_data: Optional[Dict[str, Any]] = None
    feedback: Optional[str] = None
