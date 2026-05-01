from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.exercise import ExerciseRecord
from app.models.user import User
from app.schemas.pose_analysis import (
    PoseAnalysisResponse,
    PoseAnalysisTriggerRequest,
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
