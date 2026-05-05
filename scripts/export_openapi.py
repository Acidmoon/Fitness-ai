"""Export the FastAPI OpenAPI schema without starting a server."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any


def _set_export_defaults() -> None:
    os.environ.setdefault("ENVIRONMENT", "test")
    os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
    os.environ.setdefault(
        "SECRET_KEY",
        "openapi-export-secret-key-not-for-runtime-use-123456",
    )
    os.environ.setdefault("VIDEO_STORAGE_BACKEND", "local")
    os.environ.setdefault("VIDEO_UPLOAD_DIR", "uploads/videos")


def _sort_schema(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _sort_schema(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_sort_schema(item) for item in value]
    return value


def export_openapi(output_path: Path) -> None:
    _set_export_defaults()
    project_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(project_root))

    from app.main import app

    schema = _sort_schema(app.openapi())
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        default="Fitness-ai-frontend/src/api/openapi.json",
        help="Path to write the exported OpenAPI JSON schema.",
    )
    args = parser.parse_args()

    export_openapi(Path(args.output))


if __name__ == "__main__":
    main()
