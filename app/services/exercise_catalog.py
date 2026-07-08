from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from app.models.exercise import Exercise
from app.services.exercise_rules.registry import find_rule_for_exercise


EXERCISES_DATASET_SOURCE = "hasaneyldrm/exercises-dataset"
EXERCISES_DATASET_COMMIT = "fdb2d48eb7e26f02afbabceea205b114a13e0414"
EXERCISES_DATASET_URL = "https://github.com/hasaneyldrm/exercises-dataset"
DEFAULT_DATASET_PATH = Path("data/external/exercises-dataset/exercises.json")

BODY_PART_CATEGORY_ZH = {
    "back": "背部",
    "cardio": "有氧",
    "chest": "胸部",
    "lower arms": "前臂",
    "lower legs": "小腿",
    "neck": "颈部",
    "shoulders": "肩部",
    "upper arms": "上臂",
    "upper legs": "下肢",
    "waist": "核心",
}

LOW_EQUIPMENT_VALUES = {
    "body weight",
    "band",
    "stability ball",
    "medicine ball",
    "kettlebell",
}


@dataclass(frozen=True)
class CatalogImportSummary:
    """Summary of catalog seed operations for CLI output and tests."""

    created: int
    updated: int
    skipped: int
    total_source: int
    bodyweight_count: int


def load_external_exercises(path: Path = DEFAULT_DATASET_PATH) -> List[Dict[str, Any]]:
    """Load the external exercises dataset from a local JSON file."""
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)
    if not isinstance(data, list):
        raise ValueError("外部动作数据必须是 JSON array")
    return data


def build_exercise_from_external(raw: Dict[str, Any]) -> Exercise:
    """Convert one external dataset row into the local Exercise catalog shape."""
    standard = build_standard_metadata(raw)
    name = standard["display"]["name_zh"] or standard["display"]["name_en"]
    return Exercise(
        name=name,
        category=standard["classification"]["category_zh"],
        description=standard["display"]["description_zh"],
        standard=standard,
    )


def build_standard_metadata(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Build structured metadata stored in Exercise.standard for catalog uses."""
    external_id = _required_text(raw, "id")
    name_en = _required_text(raw, "name")
    instructions = _as_dict(raw.get("instructions"))
    instruction_steps = _as_dict(raw.get("instruction_steps"))
    equipment = _text(raw.get("equipment"))
    body_part = _text(raw.get("body_part") or raw.get("category"))
    target = _text(raw.get("target"))
    muscle_group = _text(raw.get("muscle_group"))
    secondary_muscles = _text_list(raw.get("secondary_muscles"))
    aliases = build_aliases(name_en, instructions)
    canonical_action_key = resolve_canonical_action_key(aliases)

    category_zh = BODY_PART_CATEGORY_ZH.get(body_part, "未分类")
    is_bodyweight = equipment == "body weight"
    is_campus_candidate = equipment in LOW_EQUIPMENT_VALUES

    metadata = {
        "schema_version": 1,
        "source": {
            "name": EXERCISES_DATASET_SOURCE,
            "url": EXERCISES_DATASET_URL,
            "commit": EXERCISES_DATASET_COMMIT,
            "external_id": external_id,
            "license": "MIT for dataset text and structure; media excluded",
        },
        "display": {
            "name_en": name_en,
            "name_zh": build_chinese_display_name(name_en, instructions),
            "description_en": instructions.get("en"),
            "description_zh": instructions.get("zh") or instructions.get("en"),
            "instructions": instructions,
            "instruction_steps": instruction_steps,
        },
        "classification": {
            "category": body_part,
            "category_zh": category_zh,
            "body_part": body_part,
            "equipment": equipment,
            "target": target,
            "muscle_group": muscle_group,
            "secondary_muscles": secondary_muscles,
        },
        "search": {
            "aliases": aliases,
            "normalized_aliases": sorted({_normalize_alias(alias) for alias in aliases if alias}),
        },
        "campus": {
            "is_bodyweight": is_bodyweight,
            "is_low_equipment_candidate": is_campus_candidate,
            "candidate_reason": build_campus_candidate_reason(equipment, body_part),
        },
        "recommendation": {
            "target_muscles": sorted(
                {value for value in [target, muscle_group, *secondary_muscles] if value}
            ),
            "equipment": equipment,
            "body_part": body_part,
        },
        "analysis": {
            "supported": False,
            "canonical_action_key": canonical_action_key,
            "rule_version": None,
            "status_reason": "动作目录可展示，但暂无姿态评分规则",
        },
        "media": {
            "image": raw.get("image"),
            "gif_url": raw.get("gif_url"),
            "media_id": raw.get("media_id"),
            "attribution": raw.get("attribution"),
            "usage_note": "媒体不随本项目授权复制；生产展示前需单独审查 Gym visual 条款。",
        },
    }
    return mark_analysis_support(metadata)


def build_builtin_exercises() -> List[Exercise]:
    """Keep project-defined AI showcase exercises alongside imported catalog rows."""
    builtins = [
        (
            "标准俯卧撑",
            "上肢",
            "双臂支撑，身体保持直线",
            "push_up",
            ["俯卧撑", "标准俯卧撑", "pushup", "push-up", "push up"],
        ),
        (
            "标准深蹲",
            "下肢",
            "双脚与肩同宽，下蹲至大腿平行地面",
            "squat",
            ["深蹲", "标准深蹲", "squat", "bodyweight squat"],
        ),
        ("平板支撑", "核心", "双臂支撑，身体保持直线，坚持时间", None, ["平板支撑", "plank"]),
        ("仰卧起坐", "核心", "仰卧，双手抱头，起身至肘部触膝", None, ["仰卧起坐", "sit-up", "sit up"]),
        ("立定跳远", "下肢", "双脚起跳，测量跳跃距离", None, ["立定跳远", "standing long jump"]),
    ]
    exercises = []
    for name, category, description, action_key, aliases in builtins:
        metadata = {
            "schema_version": 1,
            "source": {"name": "fitness-ai", "external_id": None},
            "display": {
                "name_en": None,
                "name_zh": name,
                "description_en": None,
                "description_zh": description,
                "instructions": {"zh": description},
                "instruction_steps": {"zh": [description]},
            },
            "classification": {
                "category": None,
                "category_zh": category,
                "body_part": None,
                "equipment": "body weight",
                "target": None,
                "muscle_group": None,
                "secondary_muscles": [],
            },
            "search": {
                "aliases": aliases,
                "normalized_aliases": sorted({_normalize_alias(alias) for alias in aliases}),
            },
            "campus": {
                "is_bodyweight": True,
                "is_low_equipment_candidate": True,
                "candidate_reason": "普通手机可拍摄的无器械校园体测动作",
            },
            "recommendation": {
                "target_muscles": [],
                "equipment": "body weight",
                "body_part": None,
            },
            "analysis": {
                "supported": action_key is not None,
                "canonical_action_key": action_key,
                "rule_version": f"{action_key}-v1" if action_key else None,
                "status_reason": (
                    "已接入本项目姿态评分规则"
                    if action_key
                    else "动作目录可展示，但暂无姿态评分规则"
                ),
            },
            "media": {},
        }
        exercises.append(
            Exercise(
                name=name,
                category=category,
                description=description,
                standard=metadata,
            )
        )
    return exercises


def seed_exercise_catalog(
    db, source_rows: Optional[Iterable[Dict[str, Any]]] = None
) -> CatalogImportSummary:
    """Create or update the exercise catalog without deleting user records."""
    rows = list(source_rows) if source_rows is not None else load_external_exercises()
    incoming = build_builtin_exercises() + [build_exercise_from_external(row) for row in rows]
    created = 0
    updated = 0
    skipped = 0

    for exercise in incoming:
        existing = _find_existing_exercise(db, exercise)
        if existing is None:
            db.add(exercise)
            created += 1
        elif _apply_catalog_update(existing, exercise):
            updated += 1
        else:
            skipped += 1

    db.commit()
    return CatalogImportSummary(
        created=created,
        updated=updated,
        skipped=skipped,
        total_source=len(rows),
        bodyweight_count=sum(
            1 for row in rows if _text(row.get("equipment")) == "body weight"
        ),
    )


def exercise_to_catalog_response(exercise: Exercise) -> Dict[str, Any]:
    """Flatten Exercise plus JSON metadata into the public catalog API shape."""
    standard = exercise.standard if isinstance(exercise.standard, dict) else {}
    display = standard.get("display") or {}
    classification = standard.get("classification") or {}
    search = standard.get("search") or {}
    campus = standard.get("campus") or {}
    recommendation = standard.get("recommendation") or {}
    analysis = standard.get("analysis") or {}
    media = standard.get("media") or {}
    source = standard.get("source") or {}

    return {
        "id": exercise.id,
        "name": exercise.name,
        "category": exercise.category,
        "description": exercise.description,
        "aliases": search.get("aliases") or [],
        "body_part": classification.get("body_part"),
        "equipment": classification.get("equipment"),
        "target": classification.get("target"),
        "muscle_group": classification.get("muscle_group"),
        "secondary_muscles": classification.get("secondary_muscles") or [],
        "instructions": display.get("instructions") or {},
        "instruction_steps": display.get("instruction_steps") or {},
        "analysis_supported": bool(analysis.get("supported")),
        "canonical_action_key": analysis.get("canonical_action_key"),
        "analysis_rule_version": analysis.get("rule_version"),
        "analysis_status_reason": analysis.get("status_reason"),
        "is_bodyweight": bool(campus.get("is_bodyweight")),
        "is_low_equipment_candidate": bool(campus.get("is_low_equipment_candidate")),
        "campus_candidate_reason": campus.get("candidate_reason"),
        "target_muscles": recommendation.get("target_muscles") or [],
        "media_attribution": media.get("attribution"),
        "source": source.get("name"),
        "external_id": source.get("external_id"),
    }


def exercise_matches_query(exercise: Exercise, query: Optional[str]) -> bool:
    """Return whether an exercise matches a free-text catalog search query."""
    if not query:
        return True
    needle = _normalize_alias(query)
    if not needle:
        return True
    response = exercise_to_catalog_response(exercise)
    haystack = [
        response["name"],
        response["description"],
        response.get("body_part"),
        response.get("equipment"),
        response.get("target"),
        response.get("muscle_group"),
        *(response.get("secondary_muscles") or []),
        *(response.get("aliases") or []),
        *(response.get("target_muscles") or []),
    ]
    return any(needle in _normalize_alias(value) for value in haystack if value)


def exercise_matches_catalog_filters(
    exercise: Exercise,
    query: Optional[str] = None,
    equipment: Optional[str] = None,
    body_part: Optional[str] = None,
    analysis_supported: Optional[bool] = None,
    campus_candidate: Optional[bool] = None,
) -> bool:
    """Apply catalog filters used by API and recommendation candidate lists."""
    response = exercise_to_catalog_response(exercise)
    if not exercise_matches_query(exercise, query):
        return False
    if equipment and response.get("equipment") != _normalize_filter_value(equipment):
        return False
    if body_part and response.get("body_part") != _normalize_filter_value(body_part):
        return False
    if analysis_supported is not None and response["analysis_supported"] != analysis_supported:
        return False
    if campus_candidate is not None and response["is_low_equipment_candidate"] != campus_candidate:
        return False
    return True


def mark_analysis_support(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Set AI support fields by asking the current exercise rule registry."""
    aliases = metadata["search"]["aliases"]
    for alias in aliases:
        probe = Exercise(name=alias, category=metadata["classification"]["category_zh"])
        rule = find_rule_for_exercise(probe)
        if rule:
            metadata["analysis"] = {
                "supported": True,
                "canonical_action_key": rule.exercise_type,
                "rule_version": f"{rule.exercise_type}-v1",
                "status_reason": "已接入本项目姿态评分规则",
            }
            break
    return metadata


def resolve_canonical_action_key(aliases: Iterable[str]) -> Optional[str]:
    """Resolve a known action key from imported aliases without changing scoring."""
    for alias in aliases:
        probe = Exercise(name=alias)
        rule = find_rule_for_exercise(probe)
        if rule:
            return rule.exercise_type
    return None


def build_aliases(name_en: str, instructions: Dict[str, str]) -> List[str]:
    """Build stable aliases for search and rule matching."""
    aliases = {name_en, name_en.replace("-", " "), name_en.replace(" ", "-")}
    zh_name = build_chinese_display_name(name_en, instructions)
    if zh_name:
        aliases.add(zh_name)
    normalized = _normalize_alias(name_en)
    if normalized in {"pushup", "push up"}:
        aliases.update({"俯卧撑", "标准俯卧撑", "pushup", "push-up", "push up"})
    if normalized in {"squat", "bodyweight squat"}:
        aliases.update({"深蹲", "标准深蹲", "squat"})
    return sorted(alias for alias in aliases if alias)


def build_chinese_display_name(name_en: str, instructions: Dict[str, str]) -> str:
    """Prefer stable project Chinese names for known exercises; otherwise use English."""
    normalized = _normalize_alias(name_en)
    if normalized in {"pushup", "push up", "push-up"}:
        return "俯卧撑"
    if normalized in {"squat", "bodyweight squat"}:
        return "深蹲"
    zh = instructions.get("zh") or ""
    if "俯卧撑" in zh and "push" in normalized:
        return name_en
    if "深蹲" in zh and "squat" in normalized:
        return name_en
    return name_en


def build_campus_candidate_reason(equipment: str, body_part: str) -> Optional[str]:
    """Explain why an exercise is useful for campus candidate selection."""
    if equipment == "body weight":
        return "无器械动作，适合普通手机视频采集"
    if equipment in LOW_EQUIPMENT_VALUES:
        return f"低器械动作（{equipment}），可作为校园训练候选"
    return None


def _find_existing_exercise(db, incoming: Exercise) -> Optional[Exercise]:
    standard = incoming.standard if isinstance(incoming.standard, dict) else {}
    source = standard.get("source") or {}
    source_name = source.get("name")
    external_id = source.get("external_id")
    if source_name and external_id is not None:
        for exercise in db.query(Exercise).all():
            existing_standard = exercise.standard if isinstance(exercise.standard, dict) else {}
            existing_source = existing_standard.get("source") or {}
            if (
                existing_source.get("name") == source_name
                and existing_source.get("external_id") == external_id
            ):
                return exercise
    return db.query(Exercise).filter(Exercise.name == incoming.name).first()


def _apply_catalog_update(existing: Exercise, incoming: Exercise) -> bool:
    changed = False
    for field in ("category", "description", "standard"):
        if getattr(existing, field) != getattr(incoming, field):
            setattr(existing, field, getattr(incoming, field))
            changed = True
    return changed


def _required_text(raw: Dict[str, Any], key: str) -> str:
    value = _text(raw.get(key))
    if not value:
        raise ValueError(f"外部动作缺少必填字段: {key}")
    return value


def _text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _text_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    return [text for text in (_text(item) for item in value) if text]


def _normalize_alias(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = text.replace("_", " ").replace("-", " ")
    return re.sub(r"\s+", " ", text)


def _normalize_filter_value(value: str) -> str:
    return str(value).strip().lower()
