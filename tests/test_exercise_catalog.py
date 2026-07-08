from app.models.exercise import Exercise
from app.services.exercise_catalog import (
    build_standard_metadata,
    exercise_to_catalog_response,
    load_external_exercises,
    seed_exercise_catalog,
)


def test_external_dataset_loads_full_catalog_and_bodyweight_pool():
    rows = load_external_exercises()

    assert len(rows) == 1324
    assert sum(1 for row in rows if row["equipment"] == "body weight") == 325
    assert {"en", "es", "it", "tr", "ru", "zh"}.issubset(
        set(rows[0]["instructions"].keys())
    )


def test_standard_metadata_marks_only_exact_supported_external_action():
    rows = load_external_exercises()
    pushup = next(row for row in rows if row["name"] == "push-up")
    handstand_pushup = next(row for row in rows if row["name"] == "handstand push-up")
    barbell_squat = next(row for row in rows if row["name"] == "barbell full squat")

    pushup_metadata = build_standard_metadata(pushup)
    handstand_metadata = build_standard_metadata(handstand_pushup)
    squat_metadata = build_standard_metadata(barbell_squat)

    assert pushup_metadata["analysis"]["supported"] is True
    assert pushup_metadata["analysis"]["canonical_action_key"] == "push_up"
    assert handstand_metadata["analysis"]["supported"] is False
    assert squat_metadata["analysis"]["supported"] is False


def test_seed_exercise_catalog_imports_builtins_and_external_rows(db_session):
    rows = load_external_exercises()

    summary = seed_exercise_catalog(db_session, rows)

    assert summary.total_source == 1324
    assert summary.bodyweight_count == 325
    assert summary.created == 1329
    assert db_session.query(Exercise).count() == 1329

    pushup = [
        exercise
        for exercise in db_session.query(Exercise).all()
        if exercise_to_catalog_response(exercise)["external_id"] == "0662"
    ][0]
    response = exercise_to_catalog_response(pushup)
    assert "俯卧撑" in response["aliases"]
    assert response["analysis_supported"] is True
    assert response["canonical_action_key"] == "push_up"
    assert response["is_bodyweight"] is True
    assert response["source"] == "hasaneyldrm/exercises-dataset"
    assert response["external_id"] == "0662"

    builtin_squat = db_session.query(Exercise).filter(Exercise.name == "标准深蹲").one()
    builtin_response = exercise_to_catalog_response(builtin_squat)
    assert builtin_response["analysis_supported"] is True
    assert builtin_response["canonical_action_key"] == "squat"


def test_exercises_endpoint_filters_aliases_and_campus_candidates(client, db_session):
    rows = load_external_exercises()
    seed_exercise_catalog(db_session, rows)

    search_response = client.get("/api/exercise/exercises?q=俯卧撑")
    assert search_response.status_code == 200
    search_data = search_response.json()
    assert any(item["external_id"] == "0662" for item in search_data)

    ai_response = client.get("/api/exercise/exercises?analysis_supported=true")
    assert ai_response.status_code == 200
    ai_names = {item["name"] for item in ai_response.json()}
    assert {"标准俯卧撑", "标准深蹲", "俯卧撑"}.issubset(ai_names)
    assert "handstand push-up" not in ai_names

    campus_response = client.get("/api/exercise/exercises?campus_candidate=true")
    assert campus_response.status_code == 200
    campus_data = campus_response.json()
    assert any(item["external_id"] == "0662" for item in campus_data)
    assert all(item["is_low_equipment_candidate"] for item in campus_data)
