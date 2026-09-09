"""真实样例评估指标测试（纯比对逻辑，不需要模型与视频）。"""

import json
import math

import pytest

from app.schemas.pose_analysis import POSE_ANALYSIS_SCHEMA_VERSION
from app.services.cv_evaluation import (
    EvaluationSample,
    evaluate_sample,
    is_canonical_phase_sequence,
    load_manifest,
    render_markdown,
    summarize_phases,
    summarize_results,
)
from app.services.exercise_rules.registry import get_rule_by_exercise_type

PUSHUP_RULE = get_rule_by_exercise_type("push_up")


def elbow_triplet(prefix: str, angle_degrees: float, confidence: float = 0.9):
    length = 80.0
    radians = math.radians(angle_degrees)
    return [
        {
            "name": f"{prefix}_shoulder",
            "x": 100.0,
            "y": 100.0 - length,
            "score": confidence,
        },
        {"name": f"{prefix}_elbow", "x": 100.0, "y": 100.0, "score": confidence},
        {
            "name": f"{prefix}_wrist",
            "x": 100.0 + math.sin(radians) * length,
            "y": 100.0 - math.cos(radians) * length,
            "score": confidence,
        },
    ]


def fake_analysis(angles, confidence: float = 0.9):
    frames = []
    for index, angle in enumerate(angles):
        keypoints = elbow_triplet("left", angle, confidence) + elbow_triplet(
            "right", angle, confidence
        )
        frames.append(
            {
                "frame_index": index,
                "timestamp_ms": index * 200,
                "coordinate_space": "image_pixels",
                "keypoints": keypoints,
            }
        )
    return {
        "schema_version": POSE_ANALYSIS_SCHEMA_VERSION,
        "status": "done",
        "coordinate_space": "image_pixels",
        "model": {"backend": "movenet", "name": "thunder"},
        "video": {"source_fps": 10.0, "sample_fps": 5, "processed_frames": len(frames)},
        "frames": frames,
    }


def test_load_manifest_csv_parses_labels(tmp_path):
    manifest = tmp_path / "manifest.csv"
    manifest.write_text(
        "file,exercise,expected_count,expected_errors,expected_usable,camera_angle,notes\n"
        "a.mp4,俯卧撑,5,-,yes,side,标准\n"
        "b.mp4,深蹲,0,push_up_sagging_waist,no,front,故意塌腰\n"
        "c.mp4,squat,,,,,\n",
        encoding="utf-8",
    )

    samples = load_manifest(manifest)

    assert [sample.file for sample in samples] == ["a.mp4", "b.mp4", "c.mp4"]
    assert samples[0].expected_count == 5
    assert samples[0].expected_errors == ()
    assert samples[0].expected_usable is True
    assert samples[1].expected_errors == ("push_up_sagging_waist",)
    assert samples[1].expected_usable is False
    assert samples[2].expected_count is None
    assert samples[2].expected_errors is None
    assert samples[2].expected_usable is None


def test_load_manifest_json_accepts_samples_object(tmp_path):
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "samples": [
                    {
                        "file": "a.mp4",
                        "exercise": "push_up",
                        "expected_count": "3",
                        "expected_errors": "none",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    samples = load_manifest(manifest)

    assert samples[0].exercise == "push_up"
    assert samples[0].expected_count == 3
    assert samples[0].expected_errors == ()


def test_load_manifest_rejects_row_without_file(tmp_path):
    manifest = tmp_path / "manifest.csv"
    manifest.write_text("file,exercise\n,俯卧撑\n", encoding="utf-8")

    with pytest.raises(ValueError, match="缺少 file"):
        load_manifest(manifest)


def test_canonical_phase_sequence_accepts_cycle_and_rejects_regression():
    cycle = [{"phase": name} for name in ("ready", "down", "bottom", "up", "complete")]
    assert is_canonical_phase_sequence(cycle)
    assert is_canonical_phase_sequence(
        [{"phase": "ready"}, {"phase": "transition"}, {"phase": "down"}]
    )
    assert not is_canonical_phase_sequence([{"phase": "up"}, {"phase": "down"}])
    assert not is_canonical_phase_sequence([{"phase": "bogus"}])


def test_summarize_phases_counts_cycles():
    phases = [
        {"phase": "ready"},
        {"phase": "down"},
        {"phase": "bottom"},
        {"phase": "up"},
        {"phase": "complete"},
    ]

    summary = summarize_phases(phases)

    assert summary["complete_cycles"] == 1
    assert summary["canonical"] is True
    assert summary["counts"]["bottom"] == 1


def test_evaluate_sample_compares_count_and_quality():
    sample = EvaluationSample(
        file="a.mp4",
        exercise="俯卧撑",
        expected_count=1,
        expected_errors=(),
        expected_usable=True,
    )

    row = evaluate_sample(
        sample, rule=PUSHUP_RULE, analysis=fake_analysis([165, 90, 165])
    )

    assert row["scored"] is True
    assert row["count"] == 1
    assert row["count_error"] == 0
    assert row["count_exact"] is True
    assert row["predicted_usable"] is True
    assert row["quality_status"] == "ok"
    assert row["rule_version"] == "push_up-v3"
    assert row["schema_version"] == POSE_ANALYSIS_SCHEMA_VERSION


def test_evaluate_sample_reports_analysis_failure():
    row = evaluate_sample(
        EvaluationSample(file="a.mp4", exercise="俯卧撑", expected_count=3),
        rule=PUSHUP_RULE,
        error="PoseAnalysisInferenceError: 视频中没有可分析的采样帧",
    )

    assert row["scored"] is False
    assert "没有可分析的采样帧" in row["analysis_error"]


def test_evaluate_sample_marks_unsupported_exercise():
    row = evaluate_sample(
        EvaluationSample(file="a.mp4", exercise="未知动作"), rule=None
    )

    assert row["unsupported_exercise"] is True
    assert row["scored"] is False


def test_summarize_results_computes_count_metrics():
    rows = [
        evaluate_sample(
            EvaluationSample(file="a.mp4", exercise="俯卧撑", expected_count=1),
            rule=PUSHUP_RULE,
            analysis=fake_analysis([165, 90, 165]),
        ),
        evaluate_sample(
            EvaluationSample(file="b.mp4", exercise="俯卧撑", expected_count=2),
            rule=PUSHUP_RULE,
            analysis=fake_analysis([165, 90, 165]),
        ),
    ]

    summary = summarize_results(rows)
    count = summary["count"]

    assert count["compared"] == 2
    assert count["exact_matches"] == 1
    assert count["within_one"] == 2
    assert count["mae"] == 0.5
    assert count["bias"] == -0.5


def test_summarize_results_computes_error_code_metrics():
    rows = [
        evaluate_sample(
            EvaluationSample(
                file="a.mp4",
                exercise="俯卧撑",
                expected_errors=("push_up_sagging_waist",),
            ),
            rule=PUSHUP_RULE,
            analysis=fake_analysis([165, 90, 165]),
        ),
        evaluate_sample(
            EvaluationSample(file="b.mp4", exercise="俯卧撑", expected_errors=()),
            rule=PUSHUP_RULE,
            analysis=fake_analysis([165, 90, 165]),
        ),
    ]

    codes = summarize_results(rows)["error_codes"]

    assert codes["labeled_samples"] == 2
    assert codes["codes"]["push_up_sagging_waist"]["support"] == 1
    assert codes["codes"]["push_up_sagging_waist"]["true_positive"] == 0
    assert codes["codes"]["push_up_sagging_waist"]["false_negative"] == 1
    assert codes["codes"]["push_up_sagging_waist"]["recall"] == 0.0


def test_summarize_results_separates_failures_and_unsupported():
    rows = [
        evaluate_sample(
            EvaluationSample(file="a.mp4", exercise="俯卧撑"),
            rule=PUSHUP_RULE,
            error="boom",
        ),
        evaluate_sample(EvaluationSample(file="b.mp4", exercise="未知"), rule=None),
    ]

    summary = summarize_results(rows)

    assert summary["analysis_failures"] == 1
    assert summary["unsupported_exercises"] == 1
    assert summary["analysis_failure_files"] == ["a.mp4"]
    assert summary["count"] == {"compared": 0}


def test_render_markdown_contains_tables_and_versions():
    report = {
        "generated_at": "2026-09-08T00:00:00+00:00",
        "model": "thunder",
        "schema_version": POSE_ANALYSIS_SCHEMA_VERSION,
        "rule_versions": ["push_up-v3"],
        "summary": summarize_results(
            [
                evaluate_sample(
                    EvaluationSample(
                        file="a.mp4",
                        exercise="俯卧撑",
                        expected_count=1,
                        expected_errors=(),
                        expected_usable=True,
                    ),
                    rule=PUSHUP_RULE,
                    analysis=fake_analysis([165, 90, 165]),
                )
            ]
        ),
        "samples": [],
    }

    markdown = render_markdown(report)

    assert "次数准确率" in markdown
    assert "push_up-v3" in markdown
    assert "| a.mp4 |" not in markdown  # samples 为空时不渲染逐条表格


def test_render_markdown_lists_sample_rows():
    rows = [
        evaluate_sample(
            EvaluationSample(
                file="a.mp4",
                exercise="俯卧撑",
                expected_count=1,
                expected_errors=(),
                camera_angle="side",
                notes="标准",
            ),
            rule=PUSHUP_RULE,
            analysis=fake_analysis([165, 90, 165]),
        )
    ]
    report = {
        "generated_at": "2026-09-08T00:00:00+00:00",
        "model": "thunder",
        "schema_version": POSE_ANALYSIS_SCHEMA_VERSION,
        "rule_versions": ["push_up-v3"],
        "summary": summarize_results(rows),
        "samples": rows,
    }

    markdown = render_markdown(report)

    assert "| a.mp4 | 俯卧撑 | side | 1 | 1 | 0 |" in markdown
