from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.repositories import (
    ExerciseRecordRepository,
    get_exercise_record_repo,
    get_owned_record_or_404,
)
from app.services.video_service import (
    MAX_FILE_SIZE,
    VideoAccessDeniedError,
    VideoNotFoundError,
    VideoUploadError,
    delete_record_video,
    resolve_video_for_access,
    upload_record_video,
)
from app.utils.security import get_current_user
from app.utils.video_files import delete_video_file, ensure_upload_dir

router = APIRouter()

ensure_upload_dir()


def _get_video_record_or_404(
    record_id: int,
    current_user: User,
    repo: ExerciseRecordRepository,
    db: Session,
):
    if not hasattr(repo, "get_owned_record"):
        repo = ExerciseRecordRepository(db)

    record = repo.get_owned_record(record_id, current_user.id)
    if not record:
        raise HTTPException(status_code=404, detail="运动记录不存在")
    return record


@router.post("/records/{record_id}/video")
def upload_video(
    record_id: int,
    video: UploadFile = File(...),
    keep_video: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    repo: ExerciseRecordRepository = Depends(get_exercise_record_repo),
):
    """上传运动记录视频"""
    record = _get_video_record_or_404(record_id, current_user, repo, db)

    try:
        result = upload_record_video(
            record,
            video,
            keep_video,
            db,
            max_file_size=MAX_FILE_SIZE,
            delete_file=delete_video_file,
        )
    except VideoUploadError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return {
        "message": result.message,
        "video_url": result.video_url,
        "file_size": result.file_size,
        "video_deleted": result.video_deleted,
        "note": result.note,
    }


@router.delete("/records/{record_id}/video")
def delete_video(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    repo: ExerciseRecordRepository = Depends(get_exercise_record_repo),
):
    """删除运动记录关联视频"""
    record = _get_video_record_or_404(record_id, current_user, repo, db)

    try:
        delete_record_video(record, db, delete_file=delete_video_file)
    except VideoNotFoundError as exc:
        raise HTTPException(status_code=404, detail=exc.message)
    except VideoUploadError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return {"message": "视频已删除"}


@router.get("/videos/{filename}")
def get_video(
    filename: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取已上传的视频文件（需认证 + 归属校验）"""
    try:
        file_path = resolve_video_for_access(filename, current_user.id, db)
    except VideoAccessDeniedError as exc:
        raise HTTPException(status_code=403, detail=exc.message)
    except VideoNotFoundError as exc:
        raise HTTPException(status_code=404, detail=exc.message)

    return FileResponse(file_path)
