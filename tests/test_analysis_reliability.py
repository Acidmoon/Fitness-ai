"""Regression coverage for analysis evidence and concurrent state changes."""

from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm.exc import StaleDataError

from app.database import Base, enable_sqlite_foreign_keys
from app.models.exercise import Exercise, ExerciseRecord
from app.models.pose_analysis_job import PoseAnalysisJob
from app.models.user import User
from app.schemas.exercise import ExerciseRecordUpdate
from app.services.cv_evaluation import (
    EvaluationSample,
    evaluate_sample,
    is_canonical_phase_sequence,
    summarize_results,
)
from app.services.pose_analysis_runtime import (
    PoseAnalysisInferenceError,
    PoseAnalysisUnavailableError,
)
from app.services.pose_analysis_service import (
    PoseAnalysisConflictError,
    _execute_pose_analysis_job,
    create_pose_analysis_job,
    process_pose_analysis_job,
    reclaim_stale_job,
    run_pose_analysis_for_record,
)
from app.services.pose_scoring_engine import score_pose_data
from app.services.exercise_rules.base import PoseScoringUnavailableError
from app.services.record_analysis_state import (
    apply_manual_measurement_updates,
    invalidate_record_analysis,
)
from app.services.video_pose_analysis import (
    analyze_video_file,
    compact_pose_analysis_result,
)
from app.services.exercise_rules.pushup import PUSHUP_RULE
from tests.test_ai_pose_analysis import (
    create_exercise_record,
    sample_pose_analysis_result,
)
from tests.test_exercise_pose_scoring import (
    create_record,
    make_full_body_pushup_analysis,
    make_full_body_pushup_frame,
    make_pose_analysis,
)


def test_evaluation_accepts_multiple_complete_cycles():
    phases = [
        {"phase": name}
        for name in (
            "ready",
            "down",
            "bottom",
            "up",
            "complete",
            "down",
            "bottom",
            "up",
            "complete",
        )
    ]
    assert is_canonical_phase_sequence(phases)


@pytest.mark.parametrize("field", ["score", "count", "duration"])
def test_required_measurements_cannot_be_explicitly_cleared(field):
    with pytest.raises(ValueError):
        ExerciseRecordUpdate.model_validate({field: None})
    assert ExerciseRecordUpdate().model_dump(exclude_unset=True) == {}
    assert ExerciseRecordUpdate(heart_rate_avg=None).model_dump(exclude_unset=True) == {
        "heart_rate_avg": None
    }
    schema = ExerciseRecordUpdate.model_json_schema()
    assert schema["properties"][field]["type"] == (
        "number" if field == "score" else "integer"
    )
    assert field not in schema.get("required", [])


@pytest.mark.parametrize("angles", [[170, 165, 170], [170, 85, 170]])
def test_fewer_than_two_repetitions_cannot_measure_rhythm_stability(angles):
    scoring = score_pose_data(
        SimpleNamespace(name="俯卧撑", standard=None),
        make_pose_analysis(angles, "push_up"),
    )
    quality = scoring["metrics"]["quality"]
    assert quality["dimensions"]["rhythm_stability"]["status"] == "not_applicable"
    assert quality["dimensions"]["rhythm_stability"]["score"] is None
    assert quality["weights"]["rhythm_stability"] == 0


def test_confidence_is_separate_from_motion_quality_score():
    results = [
        score_pose_data(
            SimpleNamespace(name="俯卧撑", standard=None),
            make_full_body_pushup_analysis(
                [
                    make_full_body_pushup_frame(i, angle, confidence=confidence)
                    for i, angle in enumerate([170, 85, 170])
                ]
            ),
        )
        for confidence in (0.65, 0.9)
    ]
    assert results[0]["score"] == results[1]["score"]
    assert results[0]["confidence"] != results[1]["confidence"]
    assert results[0]["metrics"]["quality"]["weights"]["keyframe_confidence"] == 0


def test_storage_budget_cannot_remove_pose_evidence():
    result = sample_pose_analysis_result()
    with patch("app.services.video_pose_analysis.MAX_KEYPOINTS_DATA_BYTES", 1):
        with pytest.raises(PoseAnalysisInferenceError, match="过大"):
            compact_pose_analysis_result(result)
    assert result["frames"] == sample_pose_analysis_result()["frames"]


def test_missing_dimensions_do_not_receive_full_marks():
    scoring = score_pose_data(
        SimpleNamespace(name="俯卧撑", standard=None),
        make_pose_analysis([170, 85, 170], "push_up"),
    )
    quality = scoring["metrics"]["quality"]
    assert quality["dimensions"]["body_alignment"]["score"] is None
    assert quality["dimensions"]["body_alignment"]["status"] == "unassessed"
    assert quality["weights"]["body_alignment"] == 0
    assert quality["assessment_status"] == "partial"


def test_sparse_pose_evidence_cannot_be_scored():
    analysis = make_pose_analysis([170, 85, 170], "push_up")
    analysis["frames"].extend(
        {"frame_index": i, "timestamp_ms": i * 200, "keypoints": []}
        for i in range(3, 20)
    )
    with pytest.raises(PoseScoringUnavailableError, match="有效姿态帧比例"):
        score_pose_data(SimpleNamespace(name="俯卧撑", standard=None), analysis)


def test_reclaimed_worker_cannot_resurrect_or_save_results(
    db_session, test_user, tmp_path
):
    (tmp_path / "job.mp4").write_bytes(b"video")
    record = create_exercise_record(
        db_session, test_user["user"].id, video_url="/videos/job.mp4"
    )
    creation = create_pose_analysis_job(db_session, record, record.user_id, 5)
    job_id = creation.job.id
    factory = sessionmaker(bind=db_session.get_bind())

    def reclaim_during_inference(*args, **kwargs):
        db_session.refresh(creation.job)
        assert reclaim_stale_job(db_session, creation.job, force=True)
        return sample_pose_analysis_result()

    with patch("app.utils.video_files.UPLOAD_DIR", str(tmp_path)), patch(
        "app.services.pose_analysis_service.analyze_video_file",
        side_effect=reclaim_during_inference,
    ):
        process_pose_analysis_job(job_id, 5, factory)
    db_session.refresh(creation.job)
    db_session.refresh(record)
    assert creation.job.status == "failed"
    assert creation.job.result_data is None
    assert record.keypoints_data is None


@pytest.fixture
def independent_sessions(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'concurrency.db').as_posix()}")
    enable_sqlite_foreign_keys(engine)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        with factory() as seed:
            exercise = Exercise(name="俯卧撑")
            user = User(
                username="concurrency",
                email="concurrency@example.com",
                password_hash="test-hash",
                is_active=True,
            )
            seed.add_all([exercise, user])
            seed.flush()
            record = ExerciseRecord(
                user_id=user.id,
                exercise_id=exercise.id,
                score=80,
                count=5,
                duration=10,
                video_url="/videos/job.mp4",
            )
            seed.add(record)
            seed.commit()
            record_id = record.id
        yield factory, record_id
    finally:
        engine.dispose()


def test_record_updates_detect_conflicts_across_independent_sessions(
    independent_sessions,
):
    factory, record_id = independent_sessions
    with factory() as first, factory() as second:
        first_record = first.get(ExerciseRecord, record_id)
        second_record = second.get(ExerciseRecord, record_id)
        invalidate_record_analysis(first_record, first, reason="replacement")
        first.commit()
        with pytest.raises(StaleDataError):
            invalidate_record_analysis(second_record, second, reason="replacement")
            second.commit()
        second.rollback()
    with factory() as verify:
        assert verify.get(ExerciseRecord, record_id).video_revision == 1


@pytest.mark.parametrize("change", ["manual", "video"])
def test_worker_commit_conflict_preserves_new_state_and_releases_job(
    independent_sessions,
    change,
):
    factory, record_id = independent_sessions
    with factory() as seed:
        record = seed.get(ExerciseRecord, record_id)
        job_id = create_pose_analysis_job(seed, record, record.user_id, 5).job.id
    with factory() as worker:

        def race_before_final_flush(session, flush_context, instances):
            if not any(
                isinstance(item, ExerciseRecord) and item.keypoints_data
                for item in session.dirty
            ):
                return
            with factory() as writer:
                record = writer.get(ExerciseRecord, record_id)
                if change == "video":
                    invalidate_record_analysis(record, writer, reason="replacement")
                else:
                    apply_manual_measurement_updates(record, {"score": 95})
                writer.commit()

        event.listen(worker, "before_flush", race_before_final_flush)
        with patch(
            "app.services.pose_analysis_service.check_video_ready", return_value="video"
        ), patch(
            "app.services.pose_analysis_service.analyze_video_file",
            return_value=sample_pose_analysis_result(),
        ), pytest.raises(
            PoseAnalysisConflictError
        ):
            _execute_pose_analysis_job(worker, job_id, 5)
    with factory() as verify:
        record = verify.get(ExerciseRecord, record_id)
        job = verify.get(PoseAnalysisJob, job_id)
        assert record.keypoints_data is None
        assert job.result_data is None
        assert job.status == ("cancelled" if change == "video" else "failed")
        assert record.video_revision == (1 if change == "video" else 0)
        assert record.score == (80 if change == "video" else 95)


def test_sync_analysis_cannot_bypass_an_active_job(db_session, test_user):
    record = create_exercise_record(db_session, test_user["user"].id)
    create_pose_analysis_job(db_session, record, record.user_id, 5)
    with patch(
        "app.services.pose_analysis_service.check_video_ready", return_value="video"
    ), patch(
        "app.services.pose_analysis_service.analyze_video_file"
    ) as inference, pytest.raises(
        PoseAnalysisConflictError
    ):
        run_pose_analysis_for_record(record, 5, db_session)
    inference.assert_not_called()


def test_reanalysis_invalidates_ai_projection_without_a_live_inference_transaction(
    db_session,
    test_user,
):
    record = create_exercise_record(db_session, test_user["user"].id)
    record.score_source = record.count_source = "ai"
    record.manual_score, record.manual_count = 70, 4
    record.analysis_rule_version = "previous"
    record.scoring_data = {"score": 80}
    db_session.commit()
    job_id = create_pose_analysis_job(db_session, record, record.user_id, 5).job.id

    def infer(*args, **kwargs):
        assert not db_session.in_transaction()
        return sample_pose_analysis_result()

    with patch(
        "app.services.pose_analysis_service.check_video_ready", return_value="video"
    ), patch(
        "app.services.pose_analysis_service.analyze_video_file", side_effect=infer
    ):
        _execute_pose_analysis_job(db_session, job_id, 5)
    db_session.refresh(record)
    assert record.keypoints_data["analysis_id"]
    assert record.scoring_data is None
    assert record.analysis_rule_version is None
    assert (record.score, record.count) == (70, 4)
    assert record.score_source == record.count_source == "manual"


@pytest.mark.parametrize("field", ["score", "count", "duration"])
def test_api_rejects_null_measurements_without_persisting(
    client, db_session, test_user, field
):
    record = create_record(db_session, test_user["user"].id)
    before = getattr(record, field)
    response = client.put(
        f"/api/exercise/records/{record.id}",
        json={field: None},
        headers={"Authorization": f"Bearer {test_user['token']}"},
    )
    assert response.status_code == 422
    db_session.refresh(record)
    assert getattr(record, field) == before


def test_partial_score_is_preview_only(client, db_session, test_user):
    record = create_record(
        db_session,
        test_user["user"].id,
        exercise_name="俯卧撑",
        keypoints_data=make_pose_analysis([170, 85, 170], "push_up"),
    )
    response = client.post(
        f"/api/ai/records/{record.id}/pose-scoring",
        json={"apply": True},
        headers={"Authorization": f"Bearer {test_user['token']}"},
    )
    assert response.status_code == 400
    db_session.refresh(record)
    assert record.score == 40 and record.count == 3
    assert record.scoring_data is None


def test_score_apply_conflict_returns_409_without_overwriting_new_video(
    client,
    db_session,
    test_user,
):
    from app.services.exercise_pose_scoring import score_record_pose

    record = create_record(
        db_session,
        test_user["user"].id,
        exercise_name="俯卧撑",
        keypoints_data=make_full_body_pushup_analysis(
            [
                make_full_body_pushup_frame(i, angle)
                for i, angle in enumerate([170, 85, 170])
            ]
        ),
    )
    record_id = record.id
    factory = sessionmaker(bind=db_session.get_bind())

    def race_after_scoring(loaded_record):
        result = score_record_pose(loaded_record)
        with factory() as writer:
            current = writer.get(ExerciseRecord, record_id)
            invalidate_record_analysis(current, writer, reason="replacement")
            writer.commit()
        return result

    with patch("app.api.ai.score_record_pose", side_effect=race_after_scoring):
        response = client.post(
            f"/api/ai/records/{record_id}/pose-scoring",
            json={"apply": True},
            headers={"Authorization": f"Bearer {test_user['token']}"},
        )
    assert response.status_code == 409
    assert response.json()["code"] == "CONCURRENT_UPDATE"
    # The test dependency keeps this session open; production get_db closes it.
    db_session.rollback()
    db_session.refresh(record)
    assert record.video_revision == 1 and record.keypoints_data is None
    assert record.score == 40 and record.count == 3
    assert record.scoring_data is None


def test_applied_snapshot_retains_score_evidence(client, db_session, test_user):
    analysis = make_full_body_pushup_analysis(
        [
            make_full_body_pushup_frame(i, angle)
            for i, angle in enumerate([170, 85, 170])
        ]
    )
    analysis["analysis_id"] = "analysis-test"
    record = create_record(
        db_session,
        test_user["user"].id,
        exercise_name="俯卧撑",
        keypoints_data=analysis,
    )
    response = client.post(
        f"/api/ai/records/{record.id}/pose-scoring",
        json={"apply": True},
        headers={"Authorization": f"Bearer {test_user['token']}"},
    )
    assert response.status_code == 200
    db_session.refresh(record)
    assert record.scoring_data["applied"] is True
    assert record.scoring_data["analysis_id"] == "analysis-test"
    assert record.scoring_data["video_revision"] == record.video_revision
    assert record.scoring_data["metrics"]["rule"] == response.json()["metrics"]["rule"]


def test_write_guard_migration_preserves_existing_records(monkeypatch, tmp_path):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect, text
    from app.config import settings

    url = f"sqlite:///{(tmp_path / 'migration.db').as_posix()}"
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    config = Config("alembic.ini")
    command.upgrade(config, "20260710_0001")
    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO users (id, username, email, password_hash) "
                    "VALUES (1, 'legacy', 'legacy@example.com', 'test-hash')"
                )
            )
            conn.execute(text("INSERT INTO exercises (id, name) VALUES (1, 'pushup')"))
            conn.execute(
                text(
                    "INSERT INTO records (id, user_id, exercise_id, score, count, duration, "
                    "video_revision, score_source, count_source) "
                    "VALUES (1, 1, 1, 80, 5, 10, 0, 'manual', 'manual')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO pose_analysis_jobs (id, record_id, user_id, status, "
                    "video_revision, created_at, updated_at) "
                    "VALUES (1, 1, 1, 'queued', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
        command.upgrade(config, "head")
        with engine.connect() as conn:
            assert conn.execute(
                text("SELECT score, count, row_version FROM records")
            ).one() == (80, 5, 1)
            assert (
                conn.execute(
                    text("SELECT row_version FROM pose_analysis_jobs")
                ).scalar_one()
                == 1
            )
            assert (
                conn.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar_one()
                == "20260930_0002"
            )
        assert "scoring_data" in {
            column["name"] for column in inspect(engine).get_columns("records")
        }
        with sessionmaker(bind=engine)() as db:
            record = db.get(ExerciseRecord, 1)
            record.score = 90
            db.commit()
            assert record.row_version == 2
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    "standard",
    [
        {"pose_scoring": {"down_angle": 170, "up_angle": 100}},
        {"pose_scoring": {"min_confidence": float("nan")}},
        {"pose_scoring": {"required_keypoints": ["unknown"]}},
        {"pose_scoring": {"range_penalty_rate": -1}},
        {"pose_scoring": []},
        [],
    ],
)
def test_invalid_rule_configuration_fails_explicitly(standard):
    with pytest.raises(PoseScoringUnavailableError, match="配置无效"):
        PUSHUP_RULE.with_standard_overrides(standard)


def fake_video(monkeypatch, *, frames, fps=5.0, advertised_frames=None, available=True):
    cap = Mock()
    cap.isOpened.return_value = True
    cap.get.side_effect = lambda prop: (
        fps
        if prop == 1
        else (frames if advertised_frames is None else advertised_frames)
    )
    cap.read.side_effect = [(True, object())] * frames + [(False, None)]
    cv2 = SimpleNamespace(
        VideoCapture=lambda _: cap, CAP_PROP_FPS=1, CAP_PROP_FRAME_COUNT=2
    )
    monkeypatch.setitem(__import__("sys").modules, "cv2", cv2)
    backend = Mock(backend_name="test")
    backend.is_available.return_value = available
    backend.analyze_frame.return_value = {
        "model": {"name": "test"},
        "frame": {"width": 640, "height": 480},
        "keypoints": [{"name": "nose", "x": 1, "y": 2, "score": 0.9}],
    }
    return cap, backend


@pytest.mark.parametrize("frames,fps,expected_rate", [(60, 29.97, 4.995), (4, 2, 2)])
def test_video_reports_actual_sampling_rate_and_complete_coverage(
    monkeypatch, frames, fps, expected_rate
):
    cap, backend = fake_video(monkeypatch, frames=frames, fps=fps)
    result = analyze_video_file("video", sample_fps=5, backend=backend)
    assert result["summary"]["processed_frames"] == frames
    assert result["summary"]["requested_sample_fps"] == 5
    assert result["summary"]["sample_fps"] == pytest.approx(expected_rate)
    assert result["summary"]["coverage_status"] == "complete"
    cap.release.assert_called_once()


@pytest.mark.parametrize(
    "kwargs,message",
    [
        ({"frames": 121}, "预算"),
        ({"frames": 5, "advertised_frames": 20}, "完整解码"),
        ({"frames": 1, "fps": 0}, "帧率不可用"),
        ({"frames": 1, "fps": float("nan")}, "帧率不可用"),
    ],
)
def test_video_rejects_incomplete_evidence_and_releases_decoder(
    monkeypatch, kwargs, message
):
    cap, backend = fake_video(monkeypatch, **kwargs)
    with pytest.raises(PoseAnalysisInferenceError, match=message):
        analyze_video_file("video", sample_fps=5, backend=backend)
    cap.release.assert_called_once()


def test_unavailable_backend_releases_decoder(monkeypatch):
    cap, backend = fake_video(monkeypatch, frames=1, available=False)
    with pytest.raises(PoseAnalysisUnavailableError):
        analyze_video_file("video", backend=backend)
    cap.release.assert_called_once()


def test_invalid_completed_cycle_does_not_create_evaluation_mismatch():
    analysis = make_full_body_pushup_analysis(
        [
            make_full_body_pushup_frame(index, angle)
            for index, angle in enumerate([170, 85, 170])
        ]
    )
    analysis["frames"][1]["timestamp_ms"] = 6500
    analysis["frames"][2]["timestamp_ms"] = 13000
    row = evaluate_sample(
        EvaluationSample(file="slow.mp4", exercise="俯卧撑", expected_count=0),
        rule=PUSHUP_RULE,
        analysis=analysis,
    )
    assert row["count"] == 0
    assert row["completed_candidates"] == row["phase_cycles"] == 1
    assert summarize_results([row])["phases"]["cycle_count_mismatches"] == 0


def test_evaluation_reports_failed_samples_in_coverage_denominators():
    samples = [
        evaluate_sample(
            EvaluationSample(
                file="ok.mp4", exercise="俯卧撑", expected_count=1, expected_errors=()
            ),
            rule=PUSHUP_RULE,
            analysis=make_pose_analysis([170, 85, 170], "push_up"),
        ),
        evaluate_sample(
            EvaluationSample(
                file="bad.mp4", exercise="俯卧撑", expected_count=1, expected_errors=()
            ),
            rule=PUSHUP_RULE,
            error="decode failed",
        ),
    ]
    summary = summarize_results(samples)
    assert summary["samples"] == 2
    assert summary["scoring_completion_rate"] == 0.5
    assert summary["count_labeled_samples"] == summary["error_labeled_samples"] == 2
    assert (
        summary["count"]["compared"] == summary["error_codes"]["labeled_samples"] == 1
    )
