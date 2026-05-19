"""Repository for ExerciseRecord database operations."""

from datetime import date
from typing import List, Optional, Sequence

from sqlalchemy.orm import Session

from app.models.exercise import Exercise, ExerciseRecord
from app.utils.datetime import utc_day_bounds


class ExerciseRecordRepository:
    """Encapsulates common ExerciseRecord queries."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, record_id: int) -> Optional[ExerciseRecord]:
        """Get a record by its primary key."""
        return (
            self.db.query(ExerciseRecord)
            .filter(ExerciseRecord.id == record_id)
            .first()
        )

    def get_owned_record(
        self, record_id: int, user_id: int
    ) -> Optional[ExerciseRecord]:
        """Get a record that belongs to the specified user."""
        return (
            self.db.query(ExerciseRecord)
            .filter(
                ExerciseRecord.id == record_id,
                ExerciseRecord.user_id == user_id,
            )
            .first()
        )

    def get_user_records(
        self,
        user_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        exercise_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 20,
    ) -> List[ExerciseRecord]:
        """Get paginated records for a user with optional filters."""
        query = self.db.query(ExerciseRecord).filter(
            ExerciseRecord.user_id == user_id
        )

        if start_date:
            start_datetime, _ = utc_day_bounds(start_date)
            query = query.filter(ExerciseRecord.created_at >= start_datetime)
        if end_date:
            _, end_datetime = utc_day_bounds(end_date)
            query = query.filter(ExerciseRecord.created_at <= end_datetime)
        if exercise_id:
            query = query.filter(ExerciseRecord.exercise_id == exercise_id)

        return (
            query.order_by(ExerciseRecord.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_owned_records_by_ids(
        self, record_ids: Sequence[int], user_id: int
    ) -> List[ExerciseRecord]:
        """Get multiple records belonging to a user by their IDs."""
        return (
            self.db.query(ExerciseRecord)
            .filter(
                ExerciseRecord.id.in_(record_ids),
                ExerciseRecord.user_id == user_id,
            )
            .all()
        )

    def find_by_video_url(
        self, user_id: int, video_url: str
    ) -> Optional[ExerciseRecord]:
        """Find a record by user and video URL (for ownership checks)."""
        return (
            self.db.query(ExerciseRecord)
            .filter(
                ExerciseRecord.user_id == user_id,
                ExerciseRecord.video_url == video_url,
            )
            .first()
        )

    def delete_by_ids(self, record_ids: Sequence[int]) -> int:
        """Bulk delete records by IDs. Returns count of deleted rows."""
        deleted_count = (
            self.db.query(ExerciseRecord)
            .filter(ExerciseRecord.id.in_(record_ids))
            .delete(synchronize_session=False)
        )
        return deleted_count


class ExerciseRepository:
    """Encapsulates common Exercise (catalog) queries."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, exercise_id: int) -> Optional[Exercise]:
        """Get an exercise by its primary key."""
        return (
            self.db.query(Exercise).filter(Exercise.id == exercise_id).first()
        )

    def get_all(self) -> List[Exercise]:
        """Get all exercises in the catalog."""
        return self.db.query(Exercise).all()
