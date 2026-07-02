from __future__ import annotations

from typing import Optional, Sequence

from app.models.exercise import Exercise
from app.services.exercise_rules.base import ExerciseRule
from app.services.exercise_rules.pushup import PUSHUP_RULE
from app.services.exercise_rules.squat import SQUAT_RULE


DEFAULT_RULES: Sequence[ExerciseRule] = (SQUAT_RULE, PUSHUP_RULE)


def find_rule_for_exercise(exercise: Exercise) -> Optional[ExerciseRule]:
    exercise_name = (exercise.name or "").strip().lower()
    for rule in DEFAULT_RULES:
        if any(exercise_name == alias.lower() for alias in rule.aliases):
            return rule.with_standard_overrides(exercise.standard)
    return None
