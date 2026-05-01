# Repository Guidelines

## Project Structure & Module Organization

The backend lives in `app/` and follows a simple FastAPI layout: `api/` for route handlers, `models/` for SQLAlchemy models, `schemas/` for Pydantic contracts, `utils/` for shared helpers, and `middleware/` for request logging. Tests are in `tests/`, database helper scripts are in `scripts/`, and operational notes live in `DEV/`. The frontend is isolated in `Fitness-ai-frontend/` and should stay decoupled from backend code.

## Build, Test, and Development Commands

Backend:

- `venv\Scripts\python -m uvicorn app.main:app --reload` starts the API locally.
- `venv\Scripts\python -m pytest` runs the full backend test suite.
- `venv\Scripts\python -m pytest tests/test_auth.py` runs one module.
- `venv\Scripts\python -m black app tests` formats Python code.
- `venv\Scripts\python -m flake8 app tests` checks Python style.

Frontend:

- `cd Fitness-ai-frontend && npm run dev` starts the Vite app.
- `cd Fitness-ai-frontend && npm run build` validates the production build.
- `cd Fitness-ai-frontend && npm run test` runs the Vitest suite.

## Coding Style & Naming Conventions

Python uses 4-space indentation, `snake_case` for functions and variables, `PascalCase` for classes, and explicit response/request schemas. Keep route logic small and close to existing patterns; do not introduce service layers unless the change genuinely needs one. Frontend React components use `PascalCase`; shared utilities and services use `kebab-free` `camelCase` exports. Reuse the design system locked in `DEV/FRONTEND_GUIDELINES.md`.

## Testing Guidelines

Backend tests use `pytest`, `pytest-asyncio`, and an in-memory SQLite database defined in `tests/conftest.py`. Test files follow `test_*.py`; test classes use `Test*`. Update the matching test module whenever you change auth, records, stats, user, or video behavior. Frontend tests use `Vitest` and `React Testing Library`; add focused component or utility tests for new UI behavior.

## Commit & Pull Request Guidelines

Recent history uses short Chinese summaries such as `修复一些问题`; keep commits short, imperative, and specific, for example `修复记录详情接口返回字段`. Separate backend and frontend changes when practical. PRs should include: purpose, affected areas (`app/api`, `tests`, `Fitness-ai-frontend/src`, etc.), manual verification steps, and screenshots for visible UI changes.

## Security & Configuration Tips

Never hardcode secrets or database credentials. Use `.env` for `DATABASE_URL`, `SECRET_KEY`, and `ALLOWED_ORIGINS`. JWT uses `user.id` as `sub`; preserve legacy username-token compatibility unless you are intentionally removing migration support. Video access must always enforce owner checks and path traversal protection.
