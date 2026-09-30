from __future__ import annotations

import os
from types import SimpleNamespace
from uuid import uuid4
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Callable, Dict

from loguru import logger
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.config import settings
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
    compact_pose_analysis_result,
)
from app.services.record_analysis_state import MEASUREMENT_SOURCE_AI
from app.utils.datetime import utc_now
from app.utils.video_files import resolve_video_path_from_url

SessionFactory = Callable[[], Session]


@dataclass(frozen=True)
class PoseAnalysisJobCreation:
    job: PoseAnalysisJob
    created: bool


class PoseAnalysisConflictError(PoseAnalysisInferenceError):
    """The current record already has an analysis executor."""


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


def job_is_stale(job: PoseAnalysisJob, now: datetime | None = None) -> bool:
    """Return True when an active job has stayed non-terminal longer than the TTL."""
    if job.status not in POSE_ANALYSIS_ACTIVE_STATUSES:
        return False
    reference = job.updated_at or job.created_at
    if reference is None:
        return False
    ttl_seconds = settings.POSE_ANALYSIS_JOB_STALE_AFTER_SECONDS
    return ((now or utc_now()) - reference).total_seconds() > ttl_seconds


def reclaim_stale_job(
    db: Session,
    job: PoseAnalysisJob,
    now: datetime | None = None,
    force: bool = False,
) -> bool:
    """Fail an active job whose worker can no longer be trusted.

    Analysis runs inside the API process, so a deploy restart, crash or OOM can
    leave a job `queued`/`running` forever, which also blocks the record via the
    active-job unique index. The transition uses a conditional update so a worker
    that is still alive and just wrote a terminal status is never overwritten.

    `force` skips the TTL check and is only meant for startup reconciliation in a
    single-process deployment, where any active job belongs to the previous process.
    """
    if not force and not job_is_stale(job, now):
        return False

    timestamp = now or utc_now()
    updated = (
        db.query(PoseAnalysisJob)
        .filter(
            PoseAnalysisJob.id == job.id,
            PoseAnalysisJob.status.in_(POSE_ANALYSIS_ACTIVE_STATUSES),
            PoseAnalysisJob.row_version == job.row_version,
        )
        .update(
            {
                "status": POSE_ANALYSIS_JOB_STATUS_FAILED,
                "error": "任务超时或分析服务已重启，请重新发起分析",
                "updated_at": timestamp,
                "completed_at": timestamp,
                "row_version": PoseAnalysisJob.row_version + 1,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    if not updated:
        return False

    db.refresh(job)
    logger.warning(
        f"Reclaimed stale pose analysis job {job.id} for record {job.record_id}"
    )
    return True


def reconcile_stale_jobs(db: Session, reclaim_all: bool = False) -> int:
    """Reclaim stale active jobs; called on startup to recover after a restart.

    `reclaim_all` is for the single-process topology, where the previous process
    took every in-flight worker with it, so waiting for the TTL only delays the
    user's retry.
    """
    now = utc_now()
    query = db.query(PoseAnalysisJob).filter(
        PoseAnalysisJob.status.in_(POSE_ANALYSIS_ACTIVE_STATUSES)
    )
    if not reclaim_all:
        # 超时判断下推到 SQL，避免每次对账扫描所有活动行。
        cutoff = now - timedelta(seconds=settings.POSE_ANALYSIS_JOB_STALE_AFTER_SECONDS)
        query = query.filter(PoseAnalysisJob.updated_at < cutoff)
    return sum(
        1 for job in query.all() if reclaim_stale_job(db, job, now, force=reclaim_all)
    )


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
            # A worker killed mid-run must not lock the record for good.
            if reclaim_stale_job(db, active_job):
                continue
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
    raise PoseAnalysisConflictError("姿态分析任务创建冲突，请稍后重试")


def run_pose_analysis_for_record(
    record: ExerciseRecord,
    sample_fps: int | None,
    db: Session,
) -> Dict[str, Any]:
    """Analyze a record video and persist canonical keypoint data."""
    check_video_ready(record)
    creation = create_pose_analysis_job(db, record, record.user_id, sample_fps)
    if not creation.created:
        raise PoseAnalysisConflictError("记录已有活动姿态分析任务，请等待完成")
    _execute_pose_analysis_job(db, creation.job.id, sample_fps)
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
        "analysis_id": keypoints_data.get("analysis_id"),
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
    """Run a queued job without holding a database transaction during inference."""
    db = (session_factory or SessionLocal)()
    try:
        _execute_pose_analysis_job(db, job_id, sample_fps)
    except (
        FileNotFoundError,
        PoseAnalysisDisabledError,
        PoseAnalysisUnavailableError,
        PoseAnalysisInferenceError,
    ):
        db.rollback()
    except Exception as exc:
        logger.error(f"Pose analysis job {job_id} session error: {exc}")
        db.rollback()
    finally:
        db.close()


def _execute_pose_analysis_job(
    db: Session, job_id: int, sample_fps: int | None
) -> None:
    job = db.get(PoseAnalysisJob, job_id)
    if not job or job.status != POSE_ANALYSIS_JOB_STATUS_QUEUED:
        raise PoseAnalysisConflictError("姿态分析任务已由其他执行者领取")
    record = db.get(ExerciseRecord, job.record_id)
    if not record or int(record.video_revision or 0) != job.video_revision:
        job.status = POSE_ANALYSIS_JOB_STATUS_CANCELLED
        job.error = "视频版本已变化，任务已取消"
        job.updated_at = job.completed_at = utc_now()
        db.commit()
        raise PoseAnalysisInferenceError(job.error)

    video_input = SimpleNamespace(video_url=record.video_url)
    target_sample_fps = sample_fps or job.sample_fps
    record_id = record.id
    video_revision = job.video_revision
    job.status = POSE_ANALYSIS_JOB_STATUS_RUNNING
    job.updated_at = utc_now()
    db.flush()
    execution_version = job.row_version
    db.commit()
    # Expire cached rows without starting another transaction during native inference.
    db.expire_all()

    error = None
    analysis_result = None
    try:
        analysis_result = analyze_video_file(
            check_video_ready(video_input), sample_fps=target_sample_fps
        )
        analysis_result = compact_pose_analysis_result(
            {**analysis_result, "analysis_id": uuid4().hex}
        )
    except (
        FileNotFoundError,
        PoseAnalysisDisabledError,
        PoseAnalysisUnavailableError,
        PoseAnalysisInferenceError,
    ) as exc:
        error = exc
    except Exception as exc:
        logger.error(f"Pose analysis job {job_id} failed unexpectedly: {exc}")
        error = PoseAnalysisInferenceError("姿态分析任务执行失败")

    job = db.get(PoseAnalysisJob, job_id)
    if (
        not job
        or job.status != POSE_ANALYSIS_JOB_STATUS_RUNNING
        or job.row_version != execution_version
    ):
        db.rollback()
        raise PoseAnalysisConflictError("姿态分析任务已失效，分析结果未写入")
    record = db.get(ExerciseRecord, record_id)
    if not record or int(record.video_revision or 0) != video_revision:
        job.status = POSE_ANALYSIS_JOB_STATUS_CANCELLED
        job.error = "视频版本已变化，分析结果未写入"
        error = PoseAnalysisInferenceError(job.error)
    elif error is not None:
        job.status = POSE_ANALYSIS_JOB_STATUS_FAILED
        job.error = str(error)
    else:
        record.keypoints_data = analysis_result
        record.analysis_revision = video_revision
        model = analysis_result.get("model") or {}
        record.analysis_model = model.get("name") or model.get("backend")
        record.analysis_updated_at = utc_now()
        record.analysis_rule_version = None
        record.scoring_data = None
        record.feedback = None
        if record.score_source == MEASUREMENT_SOURCE_AI:
            record.score = record.manual_score if record.manual_score is not None else 0
            record.score_source = "manual"
        if record.count_source == MEASUREMENT_SOURCE_AI:
            record.count = record.manual_count if record.manual_count is not None else 0
            record.count_source = "manual"
        job.status = POSE_ANALYSIS_JOB_STATUS_SUCCEEDED
        job.error = None
        job.result_summary = analysis_result.get("summary")
        job.result_data = analysis_result
    job.updated_at = job.completed_at = utc_now()
    # Both mappers use version predicates; any concurrent invalidation rolls back
    # the job and record together, including a race after the final reads.
    try:
        # Match video invalidation's record-before-job lock order.
        if record is not None:
            db.flush([record])
        db.commit()
    except StaleDataError as exc:
        db.rollback()
        # Release only this execution's lease; a reclaimed/cancelled job stays terminal.
        now = utc_now()
        db.query(PoseAnalysisJob).filter(
            PoseAnalysisJob.id == job_id,
            PoseAnalysisJob.status == POSE_ANALYSIS_JOB_STATUS_RUNNING,
            PoseAnalysisJob.row_version == execution_version,
        ).update(
            {
                "status": POSE_ANALYSIS_JOB_STATUS_FAILED,
                "error": "记录在分析完成时已变化，请重新发起分析",
                "updated_at": now,
                "completed_at": now,
                "row_version": PoseAnalysisJob.row_version + 1,
            },
            synchronize_session=False,
        )
        db.commit()
        raise PoseAnalysisConflictError("记录已变化，分析结果未写入") from exc
    if error is not None:
        raise error
