# E:\Fitness-ai-backend\app\schemas\__init__.py

from app.schemas.user import UserCreate, UserLogin, UserResponse, Token
from app.schemas.exercise import (
    ExerciseRecordCreate,
    ExerciseRecordResponse,
    ExerciseResponse,
    ExerciseRecordUpdate,
    ExerciseRecordQuery,
)
from app.schemas.stats import ExerciseStats, CategoryStats, RecentRecord, StatsSummary
from app.schemas.pose_analysis import (
    PoseAnalysisFrame,
    PoseAnalysisModelMetadata,
    PoseAnalysisResponse,
    PoseAnalysisSummary,
    PoseAnalysisTriggerRequest,
)

__all__ = [
    "UserCreate",
    "UserLogin",
    "UserResponse",
    "Token",
    "ExerciseRecordCreate",
    "ExerciseRecordResponse",
    "ExerciseResponse",
    "ExerciseRecordUpdate",
    "ExerciseRecordQuery",
    "ExerciseStats",
    "CategoryStats",
    "RecentRecord",
    "StatsSummary",
    "PoseAnalysisFrame",
    "PoseAnalysisModelMetadata",
    "PoseAnalysisResponse",
    "PoseAnalysisSummary",
    "PoseAnalysisTriggerRequest",
]
