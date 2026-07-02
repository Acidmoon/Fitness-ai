from __future__ import annotations

import os
from typing import Any, Dict

from loguru import logger
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.exercise import ExerciseRecord
from app.models.pose_analysis_job import (
    POSE_ANALYSIS_JOB_STATUS_FAILED,
    POSE_ANALYSIS_JOB_STATUS_QUEUED,
    POSE_ANALYSIS_JOB_STATUS_RUNNING,
    POSE_ANALYSIS_JOB_STATUS_SUCCEEDED,
    PoseAnalysisJob,
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
from app.utils.video_files import resolve_video_path_from_url


def check_video_ready(record: ExerciseRecord) -> str:
    """Validate that a record points to a locally available video file."""
    if not record.video_url:
        raise PoseAnalysisInferenceError("记录没有关联视频")

    video_path = resolve_video_path_from_url(record.video_url)
    if not video_path:
        raise PoseAnalysisInferenceError("视频路径无效")

    if not os.path.exists(video_path):
        raise FileNotFoundError("视频文件不存在")

    return video_path


def create_pose_analysis_job(
    db: Session,
    record_id: int,
    user_id: int,
    sample_fps: int | None,
) -> PoseAnalysisJob:
    """Create the persisted async pose-analysis job record."""
    now = utc_now()
    job = PoseAnalysisJob(
        record_id=record_id,
        user_id=user_id,
        status=POSE_ANALYSIS_JOB_STATUS_QUEUED,
        created_at=now,
        updated_at=now,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def run_pose_analysis_for_record(
    record: ExerciseRecord,
    sample_fps: int | None,
    db: Session,
) -> Dict[str, Any]:
    """Analyze a record video and persist canonical keypoint data."""
    video_path = check_video_ready(record)
    analysis_result = analyze_video_file(video_path, sample_fps=sample_fps)
    record.keypoints_data = analysis_result
    db.commit()
    db.refresh(record)
    return build_pose_analysis_response(record.id, record.keypoints_data)


def build_pose_analysis_response(
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
    job_id: int, sample_fps: int | None = None, db: Session | None = None
) -> None:
    """Run a queued pose-analysis job with an isolated session when needed."""
    owns_session = db is None
    if db is None:
        db = SessionLocal()
    try:
        job = db.query(PoseAnalysisJob).filter(PoseAnalysisJob.id == job_id).first()
        if not job:
            return

        job.status = POSE_ANALYSIS_JOB_STATUS_RUNNING
        job.updated_at = utc_now()
        db.commit()

        record = (
            db.query(ExerciseRecord)
            .filter(ExerciseRecord.id == job.record_id)
            .first()
        )
        try:
            if not record:
                raise PoseAnalysisInferenceError("记录没有关联视频")

            analysis_result = analyze_video_file(
                check_video_ready(record), sample_fps=sample_fps
            )
            record.keypoints_data = analysis_result
            job.status = POSE_ANALYSIS_JOB_STATUS_SUCCEEDED
            job.error = None
            job.result_summary = analysis_result.get("summary")
        except FileNotFoundError as exc:
            job.status = POSE_ANALYSIS_JOB_STATUS_FAILED
            job.error = str(exc)
        except (
            PoseAnalysisDisabledError,
            PoseAnalysisUnavailableError,
            PoseAnalysisInferenceError,
        ) as exc:
            job.status = POSE_ANALYSIS_JOB_STATUS_FAILED
            job.error = str(exc)
        except Exception as exc:
            logger.error(f"Pose analysis job {job_id} failed unexpectedly: {exc}")
            job.status = POSE_ANALYSIS_JOB_STATUS_FAILED
            job.error = "姿态分析任务执行失败"

        now = utc_now()
        job.updated_at = now
        job.completed_at = now
        db.commit()
    except Exception as exc:
        logger.error(f"Pose analysis job {job_id} session error: {exc}")
        db.rollback()
    finally:
        if owns_session:
            db.close()
