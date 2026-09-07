"""`docs/openapi.json` 防漂移测试。

历史问题：`DEV/API文档.md` 停留在 2026-03-09，整套 `/api/ai` 端点零覆盖，
手抄文档随时间失真。仓库已有 `scripts/export_openapi.py`，因此把机器可读契约
纳入跟踪，并用本测试保证它与代码一致：任何端点或模型变更都必须重新生成产物喵。
"""

import json
from pathlib import Path

ARTIFACT_PATH = Path(__file__).resolve().parents[1] / "docs" / "openapi.json"

REGEN_COMMAND = "python -m scripts.export_openapi --output docs/openapi.json"


def _load_artifact() -> dict:
    assert ARTIFACT_PATH.is_file(), f"缺少 {ARTIFACT_PATH}，请运行：{REGEN_COMMAND}"
    return json.loads(ARTIFACT_PATH.read_text(encoding="utf-8"))


def test_openapi_artifact_matches_current_app_schema():
    from app.main import app

    artifact = _load_artifact()
    current = app.openapi()

    assert set(artifact["paths"]) == set(current["paths"]), (
        "端点集合与产物不一致，请运行：" + REGEN_COMMAND
    )
    assert artifact["paths"] == current["paths"], (
        "端点定义与产物不一致，请运行：" + REGEN_COMMAND
    )
    assert artifact["components"]["schemas"] == current["components"]["schemas"], (
        "模型定义与产物不一致，请运行：" + REGEN_COMMAND
    )


def test_every_mounted_api_route_is_in_the_artifact():
    """防止用 `include_in_schema=False` 悄悄藏掉路由。"""
    from app.main import app

    routes = {
        route.path
        for route in app.routes
        if getattr(route, "path", "").startswith("/api/")
    }

    assert routes <= set(_load_artifact()["paths"])


def test_ai_pose_analysis_surface_is_documented():
    paths = _load_artifact()["paths"]

    assert {
        "/api/ai/records/{record_id}/pose-analysis",
        "/api/ai/records/{record_id}/pose-analysis/jobs",
        "/api/ai/records/{record_id}/pose-analysis/jobs/latest",
        "/api/ai/pose-analysis/jobs/{job_id}",
        "/api/ai/records/{record_id}/pose-scoring",
    } <= set(paths)
