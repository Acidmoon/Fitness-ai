"""评分标准的版本化、目录覆盖路径与官方口径断言。

覆盖三件事喵：

1. 规则必须自带 `rule_version` 与 `criteria_source`，评分响应要回传生效阈值快照；
2. 动作目录里的 `analysis.rule_version` 必须与注册规则一致，不能各写一份；
3. `Exercise.standard.pose_scoring` 覆盖路径此前零测试，这里补齐。
"""

from app.models.exercise import Exercise
from app.services.exercise_catalog import (
    build_builtin_exercises,
    exercise_to_catalog_response,
)
from app.services.exercise_pose_scoring import score_pose_data
from app.services.exercise_rules.pushup import PUSHUP_RULE
from app.services.exercise_rules.registry import get_rule_by_exercise_type
from app.services.exercise_rules.squat import SQUAT_RULE

from tests.test_exercise_pose_scoring import make_pose_analysis

SQUAT_TWO_REPS_STANDARD = [176, 92, 176, 90, 176]
# 膝角 100/102 度：旧口径（down_angle 115）下两次都算有效；ACSM 平行口径下只有 100 度那次达标。
SQUAT_ABOVE_PARALLEL_LOOSE = [165, 100, 166, 102, 168]


def test_rules_declare_calibrated_versions_and_official_sources():
    assert PUSHUP_RULE.rule_version == "push_up-v3"
    assert SQUAT_RULE.rule_version == "squat-v2"

    # 《国民体质测定标准》俯卧撑：降至“肩与肘处于同一水平面”，即肘角约 90 度。
    assert PUSHUP_RULE.target_angle == 90
    assert PUSHUP_RULE.down_angle <= 95
    # 撑起需恢复开始姿势（双臂伸直），因此上阈必须明显高于半程。
    assert PUSHUP_RULE.up_angle >= 160
    # ACSM 平行口径：膝角约 90-100 度才算到位。
    assert SQUAT_RULE.down_angle <= 100
    assert SQUAT_RULE.up_angle >= 165

    assert "国民体质测定标准" in PUSHUP_RULE.criteria_source
    # 深蹲不是国标项目，来源必须写明，避免被误当成国家标准口径。
    assert "不是《国民体质测定标准》" in SQUAT_RULE.criteria_source
    assert "ACSM" in SQUAT_RULE.criteria_source


def test_catalog_analysis_version_matches_registered_rule():
    builtin_by_name = {
        exercise.name: exercise for exercise in build_builtin_exercises()
    }

    pushup_response = exercise_to_catalog_response(builtin_by_name["标准俯卧撑"])
    squat_response = exercise_to_catalog_response(builtin_by_name["标准深蹲"])

    assert pushup_response["analysis_rule_version"] == PUSHUP_RULE.rule_version
    assert squat_response["analysis_rule_version"] == SQUAT_RULE.rule_version
    assert (
        get_rule_by_exercise_type("push_up").rule_version
        == pushup_response["analysis_rule_version"]
    )

    plank_response = exercise_to_catalog_response(builtin_by_name["平板支撑"])
    assert plank_response["analysis_supported"] is False
    assert plank_response["analysis_rule_version"] is None


def test_scoring_response_carries_effective_standard_snapshot():
    exercise = Exercise(name="标准深蹲", category="下肢")

    result = score_pose_data(exercise, make_pose_analysis(SQUAT_TWO_REPS_STANDARD))

    assert result["status"] == "scored"
    assert result["rule_version"] == "squat-v2"
    rule_snapshot = result["metrics"]["rule"]
    assert rule_snapshot["exercise_type"] == "squat"
    assert rule_snapshot["rule_version"] == "squat-v2"
    assert rule_snapshot["thresholds"]["down_angle"] == SQUAT_RULE.down_angle
    assert rule_snapshot["thresholds"]["up_angle"] == SQUAT_RULE.up_angle
    assert rule_snapshot["required_keypoints"] == list(SQUAT_RULE.required_keypoints)
    assert rule_snapshot["joint_triplets"][0]["middle"] == "left_knee"


def test_catalog_pose_scoring_overrides_change_thresholds_and_version():
    """目录行可以声明自己的标准；旧口径可复现，且版本号如实跟随。"""
    legacy_exercise = Exercise(
        name="标准深蹲",
        category="下肢",
        standard={
            "pose_scoring": {
                "down_angle": 115,
                "up_angle": 155,
                "min_range": 40,
                "rule_version": "squat-v1-legacy",
                "criteria_source": "旧工程口径，仅用于复现历史结果",
            }
        },
    )

    default_result = score_pose_data(
        Exercise(name="标准深蹲", category="下肢"),
        make_pose_analysis(SQUAT_ABOVE_PARALLEL_LOOSE),
    )
    legacy_result = score_pose_data(
        legacy_exercise, make_pose_analysis(SQUAT_ABOVE_PARALLEL_LOOSE)
    )

    # 同一份关键点：膝角 100 度仍在平行判据内（判 1 次），102 度未达标被拒；
    # 旧口径会把两次都算有效。版本号区分了这两种结果，历史分数不会被误当同类比较。
    assert default_result["count"] == 1
    assert default_result["rule_version"] == "squat-v2"
    assert legacy_result["count"] == 2
    assert legacy_result["rule_version"] == "squat-v1-legacy"
    assert legacy_result["metrics"]["rule"]["thresholds"]["down_angle"] == 115
    assert (
        legacy_result["metrics"]["rule"]["criteria_source"]
        == "旧工程口径，仅用于复现历史结果"
    )


def test_override_snapshot_is_per_row_not_global():
    """覆盖只作用于该目录行，不得污染代码默认规则。"""
    overridden = Exercise(
        name="标准俯卧撑",
        category="上肢",
        standard={"pose_scoring": {"down_angle": 120}},
    )

    assert overridden.standard["pose_scoring"]["down_angle"] == 120
    assert get_rule_by_exercise_type("push_up").down_angle == PUSHUP_RULE.down_angle


def test_builtin_rows_carry_their_own_scoring_standard():
    """目录行自带标准；seed 数据与代码默认值必须完全一致，否则就是两套标准。"""
    builtin_by_name = {
        exercise.name: exercise for exercise in build_builtin_exercises()
    }

    pushup_standard = builtin_by_name["标准俯卧撑"].standard["pose_scoring"]
    squat_standard = builtin_by_name["标准深蹲"].standard["pose_scoring"]

    assert pushup_standard["rule_version"] == "push_up-v3"
    assert squat_standard["rule_version"] == "squat-v2"
    assert pushup_standard["down_angle"] == PUSHUP_RULE.down_angle
    assert squat_standard["down_angle"] == SQUAT_RULE.down_angle

    # 用目录行重新构造规则，结果应与代码默认规则逐字段相等（无静默漂移）。
    rebuilt_pushup = PUSHUP_RULE.with_standard_overrides(
        {"pose_scoring": pushup_standard}
    )
    rebuilt_squat = SQUAT_RULE.with_standard_overrides({"pose_scoring": squat_standard})
    assert rebuilt_pushup == PUSHUP_RULE
    assert rebuilt_squat == SQUAT_RULE


def test_builtin_rows_without_rule_carry_no_standard():
    builtin_by_name = {
        exercise.name: exercise for exercise in build_builtin_exercises()
    }

    assert builtin_by_name["平板支撑"].standard["pose_scoring"] is None
    assert builtin_by_name["仰卧起坐"].standard["pose_scoring"] is None


def test_external_catalog_rows_get_standard_when_rule_matches():
    from app.services.exercise_catalog import (
        build_exercise_from_external,
        load_external_exercises,
    )

    rows = load_external_exercises()
    external_pushup = next(row for row in rows if row["name"] == "push-up")

    exercise = build_exercise_from_external(external_pushup)

    assert exercise.standard["analysis"]["supported"] is True
    assert exercise.standard["pose_scoring"]["rule_version"] == "push_up-v3"
    assert exercise.standard["pose_scoring"]["up_angle"] == PUSHUP_RULE.up_angle
