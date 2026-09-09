"""真实样例评估：把人工标注与算法输出对比成可引用的指标。

这里的函数只做“比对与统计”，不碰推理，因此可以在没有模型的环境里用伪造结果测试。
评估报告必须自带 `rule_version`、`schema_version`、模型标识，否则跨版本结果不可比。
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

CANONICAL_PHASE_ORDER: Tuple[str, ...] = (
    "ready",
    "down",
    "bottom",
    "up",
    "complete",
)

# 清单里表示“明确没有错误”的写法；留空表示未标注。
NO_ERROR_MARKERS = {"-", "none", "无", "无错误"}
ERROR_SEPARATORS = (";", ",", "|", " ")


@dataclass(frozen=True)
class EvaluationSample:
    """一条人工标注样本。"""

    file: str
    exercise: str
    expected_count: Optional[int] = None
    expected_errors: Optional[Tuple[str, ...]] = None
    expected_usable: Optional[bool] = None
    camera_angle: str = ""
    sample_fps: Optional[int] = None
    notes: str = ""

    @property
    def errors_labeled(self) -> bool:
        return self.expected_errors is not None


def _parse_optional_int(value: Any, field_name: str, source: str) -> Optional[int]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError as exc:
        raise ValueError(
            f"{source}: 字段 {field_name} 需要整数，收到 {value!r}"
        ) from exc


def _parse_optional_bool(value: Any) -> Optional[bool]:
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text:
        return None
    if text in {"1", "true", "yes", "y", "是", "可用"}:
        return True
    if text in {"0", "false", "no", "n", "否", "不可用"}:
        return False
    return None


def _parse_errors(value: Any) -> Optional[Tuple[str, ...]]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.lower() in NO_ERROR_MARKERS:
        return ()
    for separator in ERROR_SEPARATORS[1:]:
        text = text.replace(separator, ERROR_SEPARATORS[0])
    return tuple(
        part.strip() for part in text.split(ERROR_SEPARATORS[0]) if part.strip()
    )


def _row_to_sample(row: Mapping[str, Any], source: str) -> EvaluationSample:
    file_value = str(row.get("file") or "").strip()
    exercise = str(row.get("exercise") or row.get("exercise_type") or "").strip()
    if not file_value:
        raise ValueError(f"{source}: 缺少 file 字段")
    if not exercise:
        raise ValueError(f"{source}: {file_value} 缺少 exercise 字段")
    return EvaluationSample(
        file=file_value,
        exercise=exercise,
        expected_count=_parse_optional_int(
            row.get("expected_count"), "expected_count", source
        ),
        expected_errors=_parse_errors(row.get("expected_errors")),
        expected_usable=_parse_optional_bool(row.get("expected_usable")),
        camera_angle=str(row.get("camera_angle") or "").strip(),
        sample_fps=_parse_optional_int(row.get("sample_fps"), "sample_fps", source),
        notes=str(row.get("notes") or "").strip(),
    )


def load_manifest(path: Path) -> List[EvaluationSample]:
    """读取 CSV 或 JSON 清单。

    CSV 用表头字段：`file, exercise, expected_count, expected_errors,
    expected_usable, camera_angle, sample_fps, notes`。
    JSON 可以是数组，也可以是 `{"samples": [...]}`。
    `expected_errors` 写 `-` 表示“明确没有错误”，留空表示“未标注”。
    """

    text = path.read_text(encoding="utf-8-sig")
    if path.suffix.lower() == ".json":
        payload = json.loads(text)
        rows: Iterable[Mapping[str, Any]]
        if isinstance(payload, Mapping):
            rows = payload.get("samples") or []
        elif isinstance(payload, list):
            rows = payload
        else:
            raise ValueError(f"{path}: JSON 清单必须是数组或含 samples 的对象")
        return [_row_to_sample(row, str(path)) for row in rows]

    reader = csv.DictReader(text.splitlines())
    return [_row_to_sample(row, str(path)) for row in reader]


def is_canonical_phase_sequence(phases: Sequence[Mapping[str, Any]]) -> bool:
    """相位必须按 `ready → down → bottom → up → complete` 的次序出现。

    `transition` 视为噪声忽略；同一相位可重复出现（滞回抖动），但不能回退。
    """

    last_rank = -1
    for event in phases:
        phase = str(event.get("phase") or "")
        if phase == "transition":
            continue
        if phase not in CANONICAL_PHASE_ORDER:
            return False
        rank = CANONICAL_PHASE_ORDER.index(phase)
        if rank < last_rank:
            return False
        last_rank = rank
    return True


def summarize_phases(phases: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    counts = {phase: 0 for phase in CANONICAL_PHASE_ORDER}
    for event in phases:
        phase = str(event.get("phase") or "")
        if phase in counts:
            counts[phase] += 1
    return {
        "events": len(phases),
        "counts": counts,
        "complete_cycles": counts["complete"],
        "canonical": is_canonical_phase_sequence(phases),
    }


def evaluate_sample(
    sample: EvaluationSample,
    *,
    rule: Any,
    analysis: Optional[Mapping[str, Any]] = None,
    error: Optional[str] = None,
) -> Dict[str, Any]:
    """对比一条样本的人工标注与算法输出。"""

    row: Dict[str, Any] = {
        "file": sample.file,
        "exercise": sample.exercise,
        "camera_angle": sample.camera_angle,
        "notes": sample.notes,
        "expected_count": sample.expected_count,
        "expected_errors": (
            None if sample.expected_errors is None else list(sample.expected_errors)
        ),
        "expected_usable": sample.expected_usable,
        "analysis_error": error,
        "scored": False,
    }
    if rule is None:
        row["unsupported_exercise"] = True
        return row
    if error is not None or analysis is None:
        return row

    from app.services.pose_scoring_engine import score_pose_data

    scoring = score_pose_data(
        SimpleNamespace(name=rule.aliases[0], standard=None), analysis
    )
    metrics = scoring.get("metrics") or {}
    video_quality = ((metrics.get("quality") or {}).get("video")) or {}
    phases = metrics.get("phases") or []
    phase_summary = summarize_phases(phases)

    row.update(
        {
            "scored": True,
            "status": scoring.get("status"),
            "rule_version": (metrics.get("rule") or {}).get("rule_version"),
            "schema_version": analysis.get("schema_version"),
            "model": ((analysis.get("model") or {}).get("name")),
            "count": scoring.get("count"),
            "score": scoring.get("score"),
            "valid_frames": video_quality.get("valid_frames"),
            "total_frames": video_quality.get("total_frames"),
            "valid_frame_ratio": video_quality.get("valid_frame_ratio"),
            "average_confidence": video_quality.get("average_keypoint_confidence"),
            "quality_status": video_quality.get("status"),
            "predicted_usable": video_quality.get("status") not in (None, "invalid"),
            "predicted_errors": [
                str(item.get("code")) for item in (metrics.get("errors") or [])
            ],
            "phase_canonical": phase_summary["canonical"],
            "phase_cycles": phase_summary["complete_cycles"],
            "phase_counts": phase_summary["counts"],
        }
    )

    if sample.expected_count is not None and row.get("count") is not None:
        row["count_error"] = int(row["count"]) - int(sample.expected_count)
        row["count_abs_error"] = abs(row["count_error"])
        row["count_within_one"] = row["count_abs_error"] <= 1
        row["count_exact"] = row["count_error"] == 0
    return row


def _mean(values: Sequence[float]) -> Optional[float]:
    if not values:
        return None
    return round(sum(values) / len(values), 4)


def _count_metrics(rows: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    compared = [row for row in rows if "count_error" in row]
    if not compared:
        return {"compared": 0}
    abs_errors = [float(row["count_abs_error"]) for row in compared]
    signed = [float(row["count_error"]) for row in compared]
    return {
        "compared": len(compared),
        "exact_matches": sum(1 for row in compared if row["count_exact"]),
        "exact_rate": round(
            sum(1 for row in compared if row["count_exact"]) / len(compared), 4
        ),
        "within_one": sum(1 for row in compared if row["count_within_one"]),
        "within_one_rate": round(
            sum(1 for row in compared if row["count_within_one"]) / len(compared), 4
        ),
        "mae": _mean(abs_errors),
        "max_abs_error": max(abs_errors),
        "bias": _mean(signed),
    }


def _usable_metrics(rows: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    compared = [
        row
        for row in rows
        if row.get("expected_usable") is not None
        and row.get("predicted_usable") is not None
    ]
    if not compared:
        return {"compared": 0}
    agreements = sum(
        1
        for row in compared
        if bool(row["expected_usable"]) == bool(row["predicted_usable"])
    )
    return {
        "compared": len(compared),
        "agreements": agreements,
        "agreement_rate": round(agreements / len(compared), 4),
        "false_usable": sum(
            1
            for row in compared
            if row["predicted_usable"] and not row["expected_usable"]
        ),
        "false_unusable": sum(
            1
            for row in compared
            if not row["predicted_usable"] and row["expected_usable"]
        ),
    }


def _error_code_metrics(rows: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    labeled = [
        row
        for row in rows
        if row.get("scored") and row.get("expected_errors") is not None
    ]
    if not labeled:
        return {"labeled_samples": 0, "codes": {}}

    codes = sorted(
        {code for row in labeled for code in row["expected_errors"]}
        | {code for row in labeled for code in row.get("predicted_errors") or []}
    )
    per_code: Dict[str, Dict[str, Any]] = {}
    for code in codes:
        tp = sum(
            1
            for row in labeled
            if code in (row.get("predicted_errors") or [])
            and code in row["expected_errors"]
        )
        fp = sum(
            1
            for row in labeled
            if code in (row.get("predicted_errors") or [])
            and code not in row["expected_errors"]
        )
        fn = sum(
            1
            for row in labeled
            if code not in (row.get("predicted_errors") or [])
            and code in row["expected_errors"]
        )
        precision = round(tp / (tp + fp), 4) if (tp + fp) else None
        recall = round(tp / (tp + fn), 4) if (tp + fn) else None
        per_code[code] = {
            "support": sum(1 for row in labeled if code in row["expected_errors"]),
            "predicted": sum(
                1 for row in labeled if code in (row.get("predicted_errors") or [])
            ),
            "true_positive": tp,
            "false_positive": fp,
            "false_negative": fn,
            "precision": precision,
            "recall": recall,
        }
    return {"labeled_samples": len(labeled), "codes": per_code}


def summarize_results(rows: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    """汇总所有样本的指标。"""

    scored = [row for row in rows if row.get("scored")]
    unsupported = [row for row in rows if row.get("unsupported_exercise")]
    failed = [
        row
        for row in rows
        if not row.get("scored") and not row.get("unsupported_exercise")
    ]
    phases = [row for row in scored if row.get("phase_canonical") is not None]
    cycle_mismatch = [
        row
        for row in scored
        if row.get("phase_cycles") is not None
        and row.get("count") is not None
        and row["phase_cycles"] != row["count"]
    ]
    confidences = [
        float(row["average_confidence"])
        for row in scored
        if row.get("average_confidence") is not None
    ]
    return {
        "samples": len(rows),
        "scored": len(scored),
        "unsupported_exercises": len(unsupported),
        "unsupported_files": [row["file"] for row in unsupported],
        "analysis_failures": len(failed),
        "analysis_failure_files": [row["file"] for row in failed],
        "count": _count_metrics(rows),
        "usable": _usable_metrics(rows),
        "error_codes": _error_code_metrics(rows),
        "phases": {
            "checked": len(phases),
            "canonical": sum(1 for row in phases if row["phase_canonical"]),
            "canonical_rate": (
                round(
                    sum(1 for row in phases if row["phase_canonical"]) / len(phases), 4
                )
                if phases
                else None
            ),
            "cycle_count_mismatches": len(cycle_mismatch),
        },
        "confidence": {
            "average": _mean(confidences),
            "minimum": round(min(confidences), 4) if confidences else None,
        },
    }


def render_markdown(report: Mapping[str, Any]) -> str:
    """把报告渲染成可粘进结题材料的 Markdown。"""

    lines: List[str] = []
    lines.append("# 姿态识别评估报告")
    lines.append("")
    lines.append(f"- 生成时间：{report.get('generated_at')}")
    lines.append(f"- 样本数：{report.get('summary', {}).get('samples')}")
    lines.append(
        f"- 模型：{report.get('model')} | 关键点 schema：{report.get('schema_version')}"
    )
    lines.append(f"- 规则版本：{report.get('rule_versions')}")
    lines.append("")

    summary = report.get("summary") or {}
    count = summary.get("count") or {}
    lines.append("## 次数准确率")
    lines.append("")
    if count.get("compared"):
        lines.append("| 指标 | 值 |")
        lines.append("| --- | --- |")
        lines.append(f"| 对比样本 | {count['compared']} |")
        lines.append(
            f"| 完全一致 | {count['exact_matches']} ({count['exact_rate']:.1%}) |"
        )
        lines.append(
            f"| 误差 ≤1 次 | {count['within_one']} ({count['within_one_rate']:.1%}) |"
        )
        lines.append(f"| MAE | {count['mae']} |")
        lines.append(f"| 最大绝对误差 | {count['max_abs_error']} |")
        lines.append(f"| 偏差（正=多计） | {count['bias']} |")
    else:
        lines.append("清单里没有 `expected_count`，未计算次数指标。")
    lines.append("")

    usable = summary.get("usable") or {}
    lines.append("## 可用性判定")
    lines.append("")
    if usable.get("compared"):
        lines.append(
            f"一致率 {usable['agreement_rate']:.1%}"
            f"（误判可用 {usable['false_usable']}，误判不可用 {usable['false_unusable']}）"
        )
    else:
        lines.append("清单里没有 `expected_usable`，未计算可用性指标。")
    lines.append("")

    codes = (summary.get("error_codes") or {}).get("codes") or {}
    lines.append("## 错误判据")
    lines.append("")
    if codes:
        lines.append("| 错误码 | 标注数 | 预测数 | TP | FP | FN | 精确率 | 召回率 |")
        lines.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
        for code, item in codes.items():
            precision = "-" if item["precision"] is None else f"{item['precision']:.1%}"
            recall = "-" if item["recall"] is None else f"{item['recall']:.1%}"
            lines.append(
                f"| `{code}` | {item['support']} | {item['predicted']} | "
                f"{item['true_positive']} | {item['false_positive']} | "
                f"{item['false_negative']} | {precision} | {recall} |"
            )
    else:
        lines.append("清单里没有标注 `expected_errors`，未计算错误判据指标。")
    lines.append("")

    phases = summary.get("phases") or {}
    lines.append("## 相位与置信度")
    lines.append("")
    lines.append(
        f"- 相位序列合法率：{phases.get('canonical_rate')}"
        f"（{phases.get('canonical')}/{phases.get('checked')}）"
    )
    lines.append(
        f"- 完整周期数与计次不一致的样本：{phases.get('cycle_count_mismatches')}"
    )
    confidence = summary.get("confidence") or {}
    lines.append(
        f"- 平均置信度：{confidence.get('average')}，最低：{confidence.get('minimum')}"
    )
    lines.append("")

    lines.append("## 逐条结果")
    lines.append("")
    lines.append("| 文件 | 动作 | 机位 | 人工 | AI | 误差 | 质量 | 预测错误 | 备注 |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for row in report.get("samples") or []:
        if row.get("unsupported_exercise"):
            lines.append(
                f"| {row['file']} | {row['exercise']} | - | - | 未注册规则 | - | - | - | - |"
            )
            continue
        if row.get("analysis_error"):
            lines.append(
                f"| {row['file']} | {row['exercise']} | {row.get('camera_angle') or '-'} | "
                f"{row.get('expected_count') or '-'} | 分析失败 | - | - | - | {row['analysis_error']} |"
            )
            continue
        predicted = ", ".join(row.get("predicted_errors") or []) or "-"
        lines.append(
            f"| {row['file']} | {row['exercise']} | {row.get('camera_angle') or '-'} | "
            f"{row.get('expected_count') if row.get('expected_count') is not None else '-'} | "
            f"{row.get('count')} | {row.get('count_error')} | {row.get('quality_status')} | "
            f"{predicted} | {row.get('notes') or ''} |"
        )
    lines.append("")
    return "\n".join(lines)
