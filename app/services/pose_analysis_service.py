from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Callable, Dict

from loguru import logger
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.exercise import ExerciseRecord
from app.models.pose_analysis_job import (
    POSE_ANALYSIS_ACTIVE_STATUSES,
    POSE_ANALYSIS_JOB_STATUS_CANCELLED,
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

SessionFactory = Callable[[], Session]


@dataclass(frozen=True)
class PoseAnalysisJobCreation:
    job: PoseAnalysisJob
    created: bool


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
    record: ExerciseRecord,
    user_id: int,
    sample_fps: int | None,
) -> PoseAnalysisJobCreation:
    """Create one active job per record and bind it to the current video revision."""
    for _attempt in range(3):
        db.refresh(record)
        current_video_revision = int(record.video_revision or 0)
        active_job = (
            db.query(PoseAnalysisJob)
            .filter(
                PoseAnalysisJob.record_id == record.id,
                PoseAnalysisJob.status.in_(POSE_ANALYSIS_ACTIVE_STATUSES),
            )
            .order_by(PoseAnalysisJob.id.desc())
            .first()
        )
        if active_job:
            if active_job.video_revision == current_video_revision:
                return PoseAnalysisJobCreation(job=active_job, created=False)

            # Video invalidation normally cancels stale jobs. Keep this defensive
            # check because a concurrent request can observe the unique index first.
            now = utc_now()
            active_job.status = POSE_ANALYSIS_JOB_STATUS_CANCELLED
            active_job.error = "视频版本已变化，任务已取消"
            active_job.updated_at = now
            active_job.completed_at = now
            db.commit()
            continue

        now = utc_now()
        job = PoseAnalysisJob(
            record_id=record.id,
            user_id=user_id,
            status=POSE_ANALYSIS_JOB_STATUS_QUEUED,
            video_revision=current_video_revision,
            sample_fps=sample_fps,
            created_at=now,
            updated_at=now,
        )
        db.add(job)
        try:
            db.commit()
        except IntegrityError:
            # A concurrent request may have inserted an active row after our read.
            # Roll back and re-evaluate its video revision before reusing it.
            db.rollback()
            continue

        db.refresh(job)
        return PoseAnalysisJobCreation(job=job, created=True)

    # Repeated conflicts indicate sustained concurrent mutation. Never return an
    # active job without proving that it belongs to the current video revision.
    raise PoseAnalysisInferenceError("姿态分析任务创建冲突，请稍后重试")


def run_pose_analysis_for_record(
    record: ExerciseRecord,
    sample_fps: int | None,
    db: Session,
) -> Dict[str, Any]:
    """Analyze a record video and persist canonical keypoint data."""
    expected_video_revision = int(record.video_revision or 0)
    video_path = check_video_ready(record)
    analysis_result = analyze_video_file(video_path, sample_fps=sample_fps)
    db.refresh(record)
    if int(record.video_revision or 0) != expected_video_revision:
        raise PoseAnalysisInferenceError("视频版本已变化，分析结果未写入")

    record.keypoints_data = analysis_result
    record.analysis_revision = expected_video_revision
    model = analysis_result.get("model") or {}
    record.analysis_model = model.get("name") or model.get("backend")
    record.analysis_updated_at = utc_now()
    db.commit()
    db.refresh(record)
    return build_pose_analysis_response(
        record.id,
        record.keypoints_data,
        video_revision=int(record.video_revision or 0),
        analysis_revision=record.analysis_revision,
    )


def build_pose_analysis_response(
    record_id: int,
    keypoints_data: Dict[str, Any] | None,
    *,
    video_revision: int = 0,
    analysis_revision: int | None = None,
) -> Dict[str, Any]:
    if not keypoints_data or analysis_revision != video_revision:
        return {
            "record_id": record_id,
            "video_revision": video_revision,
            "analysis_revision": analysis_revision,
            "schema_version": POSE_ANALYSIS_SCHEMA_VERSION,
            "status": "idle",
            "frames": [],
        }

    return {
        "record_id": record_id,
        "video_revision": video_revision,
        "analysis_revision": analysis_revision,
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
    job_id: int,
    sample_fps: int | None = None,
    session_factory: SessionFactory | None = None,
) -> None:
    """Run a queued pose-analysis job in a session isolated from the HTTP request."""
    db = (session_factory or SessionLocal)()
    try:
        job = db.query(PoseAnalysisJob).filter(PoseAnalysisJob.id == job_id).first()
        if not job:
            return
        if job.status not in POSE_ANALYSIS_ACTIVE_STATUSES:
            return

        record = (
            db.query(ExerciseRecord).filter(ExerciseRecord.id == job.record_id).first()
        )
        if not record or int(record.video_revision or 0) != job.video_revision:
            now = utc_now()
            job.status = POSE_ANALYSIS_JOB_STATUS_CANCELLED
            job.error = "视频版本已变化，任务已取消"
            job.updated_at = now
            job.completed_at = now
            db.commit()
            return

        job.status = POSE_ANALYSIS_JOB_STATUS_RUNNING
        job.updated_at = utc_now()
        db.commit()

        try:
            analysis_result = analyze_video_file(
                check_video_ready(record), sample_fps=sample_fps or job.sample_fps
            )
            db.refresh(job)
            db.refresh(record)
            if (
                job.status == POSE_ANALYSIS_JOB_STATUS_CANCELLED
                or int(record.video_revision or 0) != job.video_revision
            ):
                job.status = POSE_ANALYSIS_JOB_STATUS_CANCELLED
                job.error = "视频版本已变化，分析结果未写入"
                return

            record.keypoints_data = analysis_result
            record.analysis_revision = job.video_revision
            model = analysis_result.get("model") or {}
            record.analysis_model = model.get("name") or model.get("backend")
            record.analysis_updated_at = utc_now()
            job.status = POSE_ANALYSIS_JOB_STATUS_SUCCEEDED
            job.error = None
            job.result_summary = analysis_result.get("summary")
            job.result_data = analysis_result
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

        finally:
            now = utc_now()
            job.updated_at = now
            job.completed_at = now
            db.commit()
    except Exception as exc:
        logger.error(f"Pose analysis job {job_id} session error: {exc}")
        db.rollback()
    finally:
        db.close()
