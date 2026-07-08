# E:\Fitness-ai-backend\app\api\exercise.py

from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.exercise import ExerciseRecord
from app.models.user import User
from app.repositories import (
    ExerciseRecordRepository,
    ExerciseRepository,
    get_exercise_record_repo,
    get_exercise_repo,
    get_owned_record_or_404,
)
from app.schemas.exercise import (
    ExerciseRecordCreate,
    ExerciseRecordPage,
    ExerciseRecordResponse,
    ExerciseResponse,
    ExerciseRecordUpdate,
)
from app.services.exercise_catalog import exercise_to_catalog_response
from app.utils.security import get_current_user
from app.utils.video_files import delete_record_videos

router = APIRouter()


@router.post("/records", response_model=ExerciseRecordResponse)
def create_record(
    record_data: ExerciseRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    exercise_repo: ExerciseRepository = Depends(get_exercise_repo),
):
    """创建运动记录"""
    exercise = exercise_repo.get_by_id(record_data.exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="动作不存在")

    db_record = ExerciseRecord(
        user_id=current_user.id,
        exercise_id=record_data.exercise_id,
        score=record_data.score,
        count=record_data.count,
        duration=record_data.duration,
        heart_rate_avg=record_data.heart_rate_avg,
        heart_rate_max=record_data.heart_rate_max,
        keypoints_data=record_data.keypoints_data,
        feedback=record_data.feedback,
    )
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return db_record


@router.get("/records", response_model=List[ExerciseRecordResponse])
def get_user_records(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    exercise_id: Optional[int] = None,
    skip: int = Query(default=0, ge=0, description="跳过的记录数"),
    limit: int = Query(
        default=20, ge=1, le=100, description="返回的记录数，范围 1-100"
    ),
    current_user: User = Depends(get_current_user),
    repo: ExerciseRecordRepository = Depends(get_exercise_record_repo),
):
    """获取用户运动记录（支持日期范围、动作 ID 过滤）。"""
    records = repo.get_user_records(
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
        exercise_id=exercise_id,
        skip=skip,
        limit=limit,
    )
    return records


@router.get("/records/page", response_model=ExerciseRecordPage)
def get_user_records_page(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    exercise_id: Optional[int] = None,
    skip: int = Query(default=0, ge=0, description="跳过的记录数"),
    limit: int = Query(
        default=20, ge=1, le=100, description="返回的记录数，范围 1-100"
    ),
    current_user: User = Depends(get_current_user),
    repo: ExerciseRecordRepository = Depends(get_exercise_record_repo),
):
    """获取用户运动记录分页响应（含总数和分页元数据）。"""
    records = repo.get_user_records(
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
        exercise_id=exercise_id,
        skip=skip,
        limit=limit,
    )
    total = repo.count_user_records(
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
        exercise_id=exercise_id,
    )
    return ExerciseRecordPage(items=records, total=total, skip=skip, limit=limit)


@router.get("/records/{record_id}", response_model=ExerciseRecordResponse)
def get_record_detail(
    record_id: int,
    current_user: User = Depends(get_current_user),
    repo: ExerciseRecordRepository = Depends(get_exercise_record_repo),
):
    """获取单条运动记录详情"""
    return get_owned_record_or_404(repo, record_id, current_user.id)


@router.get("/exercises", response_model=List[ExerciseResponse])
def get_exercises(
    q: Optional[str] = Query(default=None, description="按名称、别名、部位、器械或肌群搜索"),
    equipment: Optional[str] = Query(default=None, description="按外部动作目录 equipment 过滤"),
    body_part: Optional[str] = Query(default=None, description="按外部动作目录 body_part 过滤"),
    analysis_supported: Optional[bool] = Query(default=None, description="仅返回已接入 AI 评分规则的动作"),
    campus_candidate: Optional[bool] = Query(default=None, description="仅返回校园低器械候选动作"),
    exercise_repo: ExerciseRepository = Depends(get_exercise_repo),
):
    """获取标准动作列表"""
    exercises = exercise_repo.get_all(
        query=q,
        equipment=equipment,
        body_part=body_part,
        analysis_supported=analysis_supported,
        campus_candidate=campus_candidate,
    )
    return [exercise_to_catalog_response(exercise) for exercise in exercises]


@router.put("/records/{record_id}", response_model=ExerciseRecordResponse)
def update_record(
    record_id: int,
    record_data: ExerciseRecordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    repo: ExerciseRecordRepository = Depends(get_exercise_record_repo),
):
    """修改运动记录"""
    db_record = get_owned_record_or_404(repo, record_id, current_user.id)

    update_data = record_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_record, field, value)

    db.commit()
    db.refresh(db_record)
    return db_record


@router.delete("/records/{record_id}")
def delete_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    repo: ExerciseRecordRepository = Depends(get_exercise_record_repo),
):
    """删除运动记录"""
    db_record = get_owned_record_or_404(repo, record_id, current_user.id)

    try:
        delete_record_videos([db_record])
    except OSError:
        raise HTTPException(status_code=500, detail="记录关联视频清理失败")
    db.delete(db_record)
    db.commit()
    return {"message": "删除成功"}


@router.delete("/records")
def batch_delete_records(
    record_ids: List[int] = Query(..., description="要删除的记录 ID 列表"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    repo: ExerciseRecordRepository = Depends(get_exercise_record_repo),
):
    """批量删除运动记录"""
    user_records = repo.get_owned_records_by_ids(record_ids, current_user.id)
    try:
        delete_record_videos(user_records)
    except OSError:
        raise HTTPException(status_code=500, detail="记录关联视频清理失败")

    deleted_count = repo.delete_by_ids([r.id for r in user_records])
    db.commit()

    return {
        "message": f"成功删除 {deleted_count} 条记录",
        "deleted_count": deleted_count,
    }
