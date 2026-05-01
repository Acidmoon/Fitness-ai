from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import timedelta
from typing import List, Dict
from app.database import get_db
from app.models.exercise import ExerciseRecord, Exercise
from app.models.user import User
from app.schemas.stats import ExerciseStats, CategoryStats, RecentRecord, StatsSummary
from app.utils.datetime import utc_now
from app.utils.security import get_current_user

router = APIRouter()


@router.get("/summary", response_model=StatsSummary)
def get_stats_summary(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """获取用户综合运动统计"""

    # 1. 基础统计
    stats_query = (
        db.query(
            func.count(ExerciseRecord.id).label("total_sessions"),
            func.sum(ExerciseRecord.count).label("total_repetitions"),
            func.avg(ExerciseRecord.score).label("average_score"),
            func.max(ExerciseRecord.score).label("best_score"),
            func.sum(ExerciseRecord.duration).label("total_duration"),
        )
        .filter(ExerciseRecord.user_id == current_user.id)
        .first()
    )

    exercise_stats = ExerciseStats(
        total_sessions=stats_query.total_sessions or 0,
        total_repetitions=stats_query.total_repetitions or 0,
        average_score=round(stats_query.average_score or 0, 2),
        best_score=stats_query.best_score or 0,
        total_duration=stats_query.total_duration or 0,
    )

    # 2. 按动作分类统计
    category_query = (
        db.query(
            Exercise.category,
            func.count(ExerciseRecord.id).label("count"),
            func.avg(ExerciseRecord.score).label("average_score"),
        )
        .join(Exercise)
        .filter(ExerciseRecord.user_id == current_user.id)
        .group_by(Exercise.category)
        .all()
    )

    category_stats = [
        CategoryStats(
            category=cat.category or "未分类",
            count=cat.count,
            average_score=round(cat.average_score or 0, 2),
        )
        for cat in category_query
    ]

    # 3. 最近 10 条运动记录（用于趋势图）
    recent_query = (
        db.query(
            ExerciseRecord.id,
            Exercise.name.label("exercise_name"),
            ExerciseRecord.score,
            ExerciseRecord.count,
            ExerciseRecord.created_at,
        )
        .join(Exercise)
        .filter(ExerciseRecord.user_id == current_user.id)
        .order_by(desc(ExerciseRecord.created_at))
        .limit(10)
        .all()
    )

    recent_records = [
        RecentRecord(
            id=r.id,
            exercise_name=r.exercise_name,
            score=r.score,
            count=r.count,
            created_at=r.created_at,
        )
        for r in recent_query
    ]

    return StatsSummary(
        exercise_stats=exercise_stats,
        category_stats=category_stats,
        recent_records=recent_records,
    )


@router.get("/weekly", response_model=List[Dict])
def get_weekly_stats(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """获取最近 7 天每日运动统计"""
    today = utc_now()
    seven_days_ago = today - timedelta(days=7)

    daily_stats = (
        db.query(
            func.date(ExerciseRecord.created_at).label("date"),
            func.count(ExerciseRecord.id).label("count"),
            func.avg(ExerciseRecord.score).label("average_score"),
        )
        .filter(
            ExerciseRecord.user_id == current_user.id,
            ExerciseRecord.created_at >= seven_days_ago,
        )
        .group_by(func.date(ExerciseRecord.created_at))
        .order_by(func.date(ExerciseRecord.created_at))
        .all()
    )

    return [
        {
            "date": str(stat.date),
            "sessions": stat.count,
            "average_score": round(stat.average_score or 0, 2),
        }
        for stat in daily_stats
    ]


@router.get("/personal-best")
def get_personal_best(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """获取各动作个人最好成绩"""
    best_records = (
        db.query(
            Exercise.name,
            func.max(ExerciseRecord.score).label("best_score"),
            func.max(ExerciseRecord.count).label("best_count"),
        )
        .join(Exercise)
        .filter(ExerciseRecord.user_id == current_user.id)
        .group_by(Exercise.name)
        .all()
    )

    return [
        {
            "exercise_name": record.name,
            "best_score": record.best_score,
            "best_count": record.best_count,
        }
        for record in best_records
    ]
