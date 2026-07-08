"""Repository for ExerciseRecord database operations."""

from datetime import date
from typing import List, Optional, Sequence

from sqlalchemy.orm import Session

from app.models.exercise import Exercise, ExerciseRecord
from app.services.exercise_catalog import exercise_matches_catalog_filters
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

    def _build_user_records_query(
        self,
        user_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        exercise_id: Optional[int] = None,
    ):
        """Build the base query for user records, with optional filters."""
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
        return query

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
        query = self._build_user_records_query(
            user_id, start_date, end_date, exercise_id,
        )
        return (
            query.order_by(ExerciseRecord.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def count_user_records(
        self,
        user_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        exercise_id: Optional[int] = None,
    ) -> int:
        """Count records for a user matching optional filters."""
        query = self._build_user_records_query(
            user_id, start_date, end_date, exercise_id,
        )
        return query.count()

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

    def get_all(
        self,
        query: Optional[str] = None,
        equipment: Optional[str] = None,
        body_part: Optional[str] = None,
        analysis_supported: Optional[bool] = None,
        campus_candidate: Optional[bool] = None,
    ) -> List[Exercise]:
        """Get catalog exercises, applying JSON-backed filters in memory."""
        exercises = self.db.query(Exercise).order_by(Exercise.id.asc()).all()
        return [
            exercise
            for exercise in exercises
            if exercise_matches_catalog_filters(
                exercise,
                query=query,
                equipment=equipment,
                body_part=body_part,
                analysis_supported=analysis_supported,
                campus_candidate=campus_candidate,
            )
        ]
