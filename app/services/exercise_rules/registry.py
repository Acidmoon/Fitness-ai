from __future__ import annotations

from typing import Any, Optional, Sequence

from app.services.exercise_rules.base import ExerciseRule
from app.services.exercise_rules.pushup import PUSHUP_RULE
from app.services.exercise_rules.squat import SQUAT_RULE


DEFAULT_RULES: Sequence[ExerciseRule] = (SQUAT_RULE, PUSHUP_RULE)


def find_rule_for_exercise(exercise: Any) -> Optional[ExerciseRule]:
    """Match a scoring rule by the candidate's name/standard attributes.

    Accepts any object exposing ``name`` and optional ``standard`` (duck-typed)
    so scoring helpers stay decoupled from the ORM model.
    """
    exercise_name = (exercise.name or "").strip().lower()
    for rule in DEFAULT_RULES:
        if any(exercise_name == alias.lower() for alias in rule.aliases):
            return rule.with_standard_overrides(exercise.standard)
    return None


def get_rule_by_exercise_type(exercise_type: str) -> Optional[ExerciseRule]:
    """Return the code-default rule for a canonical action key, without catalog overrides.

    Catalog metadata (``analysis.rule_version``) and documentation must quote the same
    version the scorer will actually use, so look it up here instead of duplicating it.
    """
    for rule in DEFAULT_RULES:
        if rule.exercise_type == exercise_type:
            return rule
    return None
