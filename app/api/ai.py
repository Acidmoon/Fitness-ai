from typing import Any, Dict

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.exercise import ExerciseRecord
from app.models.pose_analysis_job import (
    POSE_ANALYSIS_JOB_STATUS_FAILED,
    POSE_ANALYSIS_JOB_STATUS_QUEUED,
    POSE_ANALYSIS_JOB_STATUS_RUNNING,
    POSE_ANALYSIS_JOB_STATUS_SUCCEEDED,
    PoseAnalysisJob,
)
from app.models.user import User
from app.schemas.pose_analysis import (
    PoseAnalysisJobResponse,
    PoseAnalysisResponse,
    PoseAnalysisTriggerRequest,
)
from app.schemas.pose_scoring import PoseScoringRequest, PoseScoringResponse
from app.services.exercise_pose_scoring import (
    PoseScoringUnavailableError,
    apply_pose_scoring_result,
    score_record_pose,
)
from app.services.pose_analysis_runtime import (
    PoseAnalysisDisabledError,
    PoseAnalysisInferenceError,
    PoseAnalysisUnavailableError,
)
from app.services.video_pose_analysis import (
    POSE_ANALYSIS_SCHEMA_VERSION,
    analyze_video_file,
)
from app.utils.datetime import utc_now
from app.utils.security import get_current_user
from app.utils.video_files import resolve_video_path_from_url

router = APIRouter()


@router.post(
    "/records/{record_id}/pose-analysis",
    response_model=PoseAnalysisResponse,
)
def trigger_pose_analysis(
    record_id: int,
    request_data: PoseAnalysisTriggerRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = _get_owned_record(db, record_id, current_user)
    if not record.video_url:
        raise HTTPException(status_code=400, detail="记录没有关联视频")

    video_path = resolve_video_path_from_url(record.video_url)
    if not video_path:
        raise HTTPException(status_code=403, detail="视频路径无效")

    import os

    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="视频文件不存在")

    try:
        analysis_result = analyze_video_file(
            video_path,
            sample_fps=request_data.sample_fps if request_data else None,
        )
    except PoseAnalysisDisabledError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    except PoseAnalysisUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    except PoseAnalysisInferenceError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    record.keypoints_data = analysis_result
    db.commit()
    db.refresh(record)

    return _build_pose_analysis_response(record.id, record.keypoints_data)


@router.post(
    "/records/{record_id}/pose-analysis/jobs",
    response_model=PoseAnalysisJobResponse,
)
def create_pose_analysis_job(
    record_id: int,
    background_tasks: BackgroundTasks,
    request_data: PoseAnalysisTriggerRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = _get_owned_record(db, record_id, current_user)
    if not record.video_url:
        raise HTTPException(status_code=400, detail="记录没有关联视频")

    video_path = resolve_video_path_from_url(record.video_url)
    if not video_path:
        raise HTTPException(status_code=403, detail="视频路径无效")

    import os

    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="视频文件不存在")

    now = utc_now()
    job = PoseAnalysisJob(
        record_id=record.id,
        user_id=current_user.id,
        status=POSE_ANALYSIS_JOB_STATUS_QUEUED,
        created_at=now,
        updated_at=now,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(
        process_pose_analysis_job,
        db,
        job.id,
        request_data.sample_fps if request_data else None,
    )

    return job


@router.get(
    "/pose-analysis/jobs/{job_id}",
    response_model=PoseAnalysisJobResponse,
)
def get_pose_analysis_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = (
        db.query(PoseAnalysisJob)
        .filter(PoseAnalysisJob.id == job_id, PoseAnalysisJob.user_id == current_user.id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="姿态分析任务不存在")

    return job


@router.get(
    "/records/{record_id}/pose-analysis",
    response_model=PoseAnalysisResponse,
)
def get_pose_analysis(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = _get_owned_record(db, record_id, current_user)
    return _build_pose_analysis_response(record.id, record.keypoints_data)


@router.post(
    "/records/{record_id}/pose-scoring",
    response_model=PoseScoringResponse,
)
def score_pose_analysis(
    record_id: int,
    request_data: PoseScoringRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = _get_owned_record(db, record_id, current_user)

    try:
        scoring_result = score_record_pose(record)
        should_apply = bool(request_data.apply) if request_data else False
        if should_apply and scoring_result["status"] == "scored":
            apply_pose_scoring_result(record, scoring_result)
            db.commit()
            db.refresh(record)
            scoring_result["applied"] = True
    except PoseScoringUnavailableError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"record_id": record.id, **scoring_result}


def _get_owned_record(
    db: Session, record_id: int, current_user: User
) -> ExerciseRecord:
    record = (
        db.query(ExerciseRecord)
        .filter(
            ExerciseRecord.id == record_id,
            ExerciseRecord.user_id == current_user.id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


def _build_pose_analysis_response(
    record_id: int, keypoints_data: Dict[str, Any] | None
) -> Dict[str, Any]:
    if not keypoints_data:
        return {
            "record_id": record_id,
            "schema_version": POSE_ANALYSIS_SCHEMA_VERSION,
            "status": "idle",
            "frames": [],
        }

    return {
        "record_id": record_id,
        "schema_version": keypoints_data.get(
            "schema_version", POSE_ANALYSIS_SCHEMA_VERSION
        ),
        "status": keypoints_data.get("status", "done"),
        "model": keypoints_data.get("model"),
        "summary": keypoints_data.get("summary"),
        "frames": keypoints_data.get("frames") or [],
        "error": keypoints_data.get("error"),
    }


def process_pose_analysis_job(
    db: Session, job_id: int, sample_fps: int | None = None
) -> None:
    job = db.query(PoseAnalysisJob).filter(PoseAnalysisJob.id == job_id).first()
    if not job:
        return

    job.status = POSE_ANALYSIS_JOB_STATUS_RUNNING
    job.updated_at = utc_now()
    db.commit()

    record = db.query(ExerciseRecord).filter(ExerciseRecord.id == job.record_id).first()
    try:
        if not record or not record.video_url:
            raise PoseAnalysisInferenceError("记录没有关联视频")

        video_path = resolve_video_path_from_url(record.video_url)
        if not video_path:
            raise PoseAnalysisInferenceError("视频路径无效")

        import os

        if not os.path.exists(video_path):
            raise PoseAnalysisInferenceError("视频文件不存在")

        analysis_result = analyze_video_file(video_path, sample_fps=sample_fps)
        record.keypoints_data = analysis_result
        job.status = POSE_ANALYSIS_JOB_STATUS_SUCCEEDED
        job.error = None
        job.result_summary = analysis_result.get("summary")
    except (
        PoseAnalysisDisabledError,
        PoseAnalysisUnavailableError,
        PoseAnalysisInferenceError,
    ) as exc:
        job.status = POSE_ANALYSIS_JOB_STATUS_FAILED
        job.error = str(exc)
    except Exception:
        job.status = POSE_ANALYSIS_JOB_STATUS_FAILED
        job.error = "姿态分析任务执行失败"

    now = utc_now()
    job.updated_at = now
    job.completed_at = now
    db.commit()
