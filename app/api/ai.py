from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session, sessionmaker

from app.database import get_db
from app.models.pose_analysis_job import PoseAnalysisJob
from app.models.user import User
from app.repositories import (
    ExerciseRecordRepository,
    get_exercise_record_repo,
    get_owned_record_or_404,
)
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
from app.services.pose_analysis_service import (
    build_pose_analysis_response,
    check_video_ready,
    create_pose_analysis_job as create_pose_analysis_job_record,
    process_pose_analysis_job,
    run_pose_analysis_for_record,
)
from app.services.pose_analysis_runtime import (
    PoseAnalysisDisabledError,
    PoseAnalysisInferenceError,
    PoseAnalysisUnavailableError,
)
from app.utils.security import get_current_user

router = APIRouter()


def _check_video_ready_for_http(record) -> str:
    try:
        return check_video_ready(record)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PoseAnalysisInferenceError as exc:
        detail = str(exc)
        status_code = 403 if "路径" in detail else 400
        raise HTTPException(status_code=status_code, detail=detail)


def _run_pose_analysis_sync(record, sample_fps: int | None, db: Session):
    try:
        return run_pose_analysis_for_record(record, sample_fps, db)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (PoseAnalysisDisabledError, PoseAnalysisUnavailableError) as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except PoseAnalysisInferenceError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post(
    "/records/{record_id}/pose-analysis",
    response_model=PoseAnalysisResponse,
)
def trigger_pose_analysis(
    record_id: int,
    request_data: PoseAnalysisTriggerRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    repo: ExerciseRecordRepository = Depends(get_exercise_record_repo),
):
    """同步执行姿态分析，并返回分析结果。"""
    record = get_owned_record_or_404(repo, record_id, current_user.id)
    return _run_pose_analysis_sync(
        record=record,
        sample_fps=request_data.sample_fps if request_data else None,
        db=db,
    )


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
    repo: ExerciseRecordRepository = Depends(get_exercise_record_repo),
):
    """创建姿态分析异步任务（推荐方式）。"""
    record = get_owned_record_or_404(repo, record_id, current_user.id)
    _check_video_ready_for_http(record)

    creation = create_pose_analysis_job_record(
        db=db,
        record=record,
        user_id=current_user.id,
        sample_fps=request_data.sample_fps if request_data else None,
    )
    if creation.created:
        # Background work must not reuse the request-scoped Session after the response.
        background_session_factory = sessionmaker(
            bind=db.get_bind(),
            autocommit=False,
            autoflush=False,
        )
        background_tasks.add_task(
            process_pose_analysis_job,
            creation.job.id,
            creation.job.sample_fps,
            background_session_factory,
        )
    return creation.job


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
        .filter(
            PoseAnalysisJob.id == job_id,
            PoseAnalysisJob.user_id == current_user.id,
        )
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="姿态分析任务不存在")

    return job


@router.get(
    "/records/{record_id}/pose-analysis/jobs/latest",
    response_model=PoseAnalysisJobResponse | None,
)
def get_latest_pose_analysis_job(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    repo: ExerciseRecordRepository = Depends(get_exercise_record_repo),
):
    """Return the latest job for the current video revision so clients can reconnect."""
    record = get_owned_record_or_404(repo, record_id, current_user.id)
    return (
        db.query(PoseAnalysisJob)
        .filter(
            PoseAnalysisJob.record_id == record.id,
            PoseAnalysisJob.user_id == current_user.id,
            PoseAnalysisJob.video_revision == int(record.video_revision or 0),
        )
        .order_by(PoseAnalysisJob.id.desc())
        .first()
    )


@router.get(
    "/records/{record_id}/pose-analysis",
    response_model=PoseAnalysisResponse,
)
def get_pose_analysis(
    record_id: int,
    current_user: User = Depends(get_current_user),
    repo: ExerciseRecordRepository = Depends(get_exercise_record_repo),
):
    record = get_owned_record_or_404(repo, record_id, current_user.id)
    return build_pose_analysis_response(
        record.id,
        record.keypoints_data,
        video_revision=int(record.video_revision or 0),
        analysis_revision=record.analysis_revision,
    )


@router.post(
    "/records/{record_id}/pose-scoring",
    response_model=PoseScoringResponse,
)
def score_pose_analysis(
    record_id: int,
    request_data: PoseScoringRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    repo: ExerciseRecordRepository = Depends(get_exercise_record_repo),
):
    record = get_owned_record_or_404(repo, record_id, current_user.id)

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
