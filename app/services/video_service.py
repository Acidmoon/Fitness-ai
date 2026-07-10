"""Video upload, deletion, and access business logic."""

import os
import uuid
from dataclasses import dataclass
from typing import Callable, Optional

from loguru import logger
from sqlalchemy.orm import Session

from app.models.exercise import ExerciseRecord
from app.services.record_analysis_state import invalidate_record_analysis
from app.utils.video_files import (
    VideoUploadTooLargeError,
    UnsupportedVideoContentError,
    build_video_url,
    delete_video_file,
    get_filename_from_video_url,
    resolve_upload_path,
    stream_upload_to_path,
    validate_video_upload_content,
)

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
DeleteVideoFile = Callable[[Optional[str]], str]


class VideoUploadError(Exception):
    """Raised when video upload validation or storage fails."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class VideoNotFoundError(Exception):
    """Raised when a video resource cannot be found."""

    def __init__(self, message: str = "视频文件不存在"):
        self.message = message
        super().__init__(self.message)


class VideoAccessDeniedError(Exception):
    """Raised when video access is denied."""

    def __init__(self, message: str = "禁止访问该文件"):
        self.message = message
        super().__init__(self.message)


@dataclass
class VideoUploadResult:
    """Result of a video upload operation."""

    message: str
    video_url: Optional[str]
    file_size: int
    video_deleted: bool
    note: str


def upload_record_video(
    record: ExerciseRecord,
    upload_file,
    keep_video: bool,
    db: Session,
    *,
    max_file_size: int = MAX_FILE_SIZE,
    delete_file: DeleteVideoFile = delete_video_file,
) -> VideoUploadResult:
    """Handle video upload for an exercise record.

    Validates the file, stores it, and updates the record accordingly.
    """
    file_ext = os.path.splitext(upload_file.filename or "")[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise VideoUploadError("不支持的视频格式")

    try:
        validate_video_upload_content(upload_file, file_ext)
    except UnsupportedVideoContentError as exc:
        raise VideoUploadError(str(exc))

    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = resolve_upload_path(unique_filename)
    if not file_path:
        raise VideoUploadError("视频文件路径生成失败", status_code=500)

    previous_video_url = record.video_url
    should_replace_previous_video = keep_video
    video_deleted = False
    file_size = 0

    try:
        file_size = stream_upload_to_path(upload_file, file_path, max_file_size)

        if keep_video:
            record.video_url = build_video_url(unique_filename)
            invalidate_record_analysis(
                record,
                db,
                reason="视频已更新，旧姿态分析任务已取消",
            )
        else:
            video_deleted = True
            delete_file(build_video_url(unique_filename))
            record.video_url = previous_video_url

        db.commit()
        db.refresh(record)
    except VideoUploadTooLargeError:
        db.rollback()
        raise VideoUploadError("文件大小超过 50MB 限制")
    except VideoUploadError:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        delete_file(build_video_url(unique_filename))
        raise

    if should_replace_previous_video and previous_video_url != record.video_url:
        try:
            delete_file(previous_video_url)
        except OSError as exc:
            logger.warning(
                "Failed to delete replaced video file for record {}: {}",
                record.id,
                str(exc),
            )

    return VideoUploadResult(
        message="视频上传成功",
        video_url=record.video_url if keep_video else None,
        file_size=file_size,
        video_deleted=video_deleted,
        note="视频仅用于临时分析，不会永久存储" if not keep_video else "视频已永久存储",
    )


def delete_record_video(
    record: ExerciseRecord,
    db: Session,
    *,
    delete_file: DeleteVideoFile = delete_video_file,
) -> None:
    """Delete the video associated with an exercise record."""
    if not record.video_url:
        raise VideoNotFoundError("该记录没有关联视频")

    previous_video_url = record.video_url
    record.video_url = None
    invalidate_record_analysis(
        record,
        db,
        reason="视频已删除，旧姿态分析任务已取消",
    )
    try:
        db.commit()
        db.refresh(record)
    except Exception:
        db.rollback()
        raise

    try:
        delete_file(previous_video_url)
    except OSError as exc:
        logger.warning(
            "Video reference removed for record {} but file cleanup failed: {}",
            record.id,
            str(exc),
        )


def resolve_video_for_access(filename: str, user_id: int, db: Session) -> str:
    """Validate and resolve a video file path for authenticated access.

    Returns the resolved file path if access is granted.
    """
    if get_filename_from_video_url(build_video_url(filename)) != filename:
        raise VideoAccessDeniedError("非法的文件名")

    file_path = resolve_upload_path(filename)
    if not file_path:
        raise VideoAccessDeniedError("禁止访问该文件")

    record = (
        db.query(ExerciseRecord)
        .filter(
            ExerciseRecord.user_id == user_id,
            ExerciseRecord.video_url == build_video_url(filename),
        )
        .first()
    )
    if not record:
        raise VideoNotFoundError("视频文件不存在")

    if not os.path.exists(file_path):
        raise VideoNotFoundError("视频文件不存在")

    return file_path
