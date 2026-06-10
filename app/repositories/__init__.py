"""Repository layer for database access patterns.

Provides repository classes and FastAPI dependency factories so routes
can request pre-instantiated repositories via Depends() instead of
constructing them manually from a db session.
"""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.exercise import ExerciseRecord
from app.repositories.exercise_record import ExerciseRecordRepository, ExerciseRepository
from app.repositories.user import UserRepository


def get_user_repo(db: Session = Depends(get_db)) -> UserRepository:
    """FastAPI dependency: yield a UserRepository."""
    return UserRepository(db)


def get_exercise_record_repo(
    db: Session = Depends(get_db),
) -> ExerciseRecordRepository:
    """FastAPI dependency: yield an ExerciseRecordRepository."""
    return ExerciseRecordRepository(db)


def get_exercise_repo(
    db: Session = Depends(get_db),
) -> ExerciseRepository:
    """FastAPI dependency: yield an ExerciseRepository (catalog)."""
    return ExerciseRepository(db)


def get_owned_record_or_404(
    repo: ExerciseRecordRepository,
    record_id: int,
    user_id: int,
) -> ExerciseRecord:
    """Return the record owned by user_id, or raise 404.

    This is the single shared ownership check used by all route modules
    that need to gate record access.
    """
    record = repo.get_owned_record(record_id, user_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


__all__ = [
    "ExerciseRecordRepository",
    "ExerciseRepository",
    "UserRepository",
    "get_exercise_record_repo",
    "get_exercise_repo",
    "get_owned_record_or_404",
    "get_user_repo",
]
