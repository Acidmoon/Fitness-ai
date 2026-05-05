# E:\Fitness-ai-backend\app\models\__init__.py

from app.models.user import User
from app.models.exercise import Exercise, ExerciseRecord
from app.models.pose_analysis_job import PoseAnalysisJob

__all__ = ["User", "Exercise", "ExerciseRecord", "PoseAnalysisJob"]
