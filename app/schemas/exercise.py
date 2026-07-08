# E:\Fitness-ai-backend\app\schemas\exercise.py

import json
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, Dict, Any, List as PyList
from datetime import datetime, date

HEART_RATE_MIN = 20
HEART_RATE_MAX = 260
MAX_FEEDBACK_LENGTH = 2000
MAX_KEYPOINTS_DATA_BYTES = 100_000


def _validate_keypoints_data_size(value: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if value is None:
        return value

    serialized = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if len(serialized.encode("utf-8")) > MAX_KEYPOINTS_DATA_BYTES:
        raise ValueError("关键点数据过大")
    return value


# 创建运动记录请求
class ExerciseRecordCreate(BaseModel):
    exercise_id: int
    score: float = Field(ge=0, le=100, description="动作评分 0-100")
    count: int = Field(ge=0, description="完成次数")
    duration: int = Field(ge=0, description="时长 (秒)")
    heart_rate_avg: Optional[float] = Field(None, ge=HEART_RATE_MIN, le=HEART_RATE_MAX)
    heart_rate_max: Optional[float] = Field(None, ge=HEART_RATE_MIN, le=HEART_RATE_MAX)
    keypoints_data: Optional[Dict[str, Any]] = None
    feedback: Optional[str] = Field(None, max_length=MAX_FEEDBACK_LENGTH)

    @field_validator("keypoints_data")
    @classmethod
    def validate_keypoints_data(cls, value):
        return _validate_keypoints_data_size(value)


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
    aliases: PyList[str] = Field(default_factory=list)
    body_part: Optional[str] = None
    equipment: Optional[str] = None
    target: Optional[str] = None
    muscle_group: Optional[str] = None
    secondary_muscles: PyList[str] = Field(default_factory=list)
    instructions: Dict[str, Any] = Field(default_factory=dict)
    instruction_steps: Dict[str, Any] = Field(default_factory=dict)
    analysis_supported: bool = False
    canonical_action_key: Optional[str] = None
    analysis_rule_version: Optional[str] = None
    analysis_status_reason: Optional[str] = None
    is_bodyweight: bool = False
    is_low_equipment_candidate: bool = False
    campus_candidate_reason: Optional[str] = None
    target_muscles: PyList[str] = Field(default_factory=list)
    media_attribution: Optional[str] = None
    source: Optional[str] = None
    external_id: Optional[str] = None

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
    heart_rate_avg: Optional[float] = Field(None, ge=HEART_RATE_MIN, le=HEART_RATE_MAX)
    heart_rate_max: Optional[float] = Field(None, ge=HEART_RATE_MIN, le=HEART_RATE_MAX)
    keypoints_data: Optional[Dict[str, Any]] = None
    feedback: Optional[str] = Field(None, max_length=MAX_FEEDBACK_LENGTH)

    @field_validator("keypoints_data")
    @classmethod
    def validate_keypoints_data(cls, value):
        return _validate_keypoints_data_size(value)


class ExerciseRecordPage(BaseModel):
    """分页运动记录响应。"""
    items: PyList[ExerciseRecordResponse]
    total: int
    skip: int
    limit: int
