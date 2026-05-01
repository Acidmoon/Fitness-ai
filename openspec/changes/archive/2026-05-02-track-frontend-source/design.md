## Context

The frontend is part of the workspace and has no nested `.git` repository. The root `.gitignore` currently ignores `Fitness-ai-frontend/`, so frontend source changes are invisible to root Git status and cannot be pushed with the backend repository.

## Goals / Non-Goals

**Goals:**

- Make frontend source and configuration trackable by the root repository.
- Keep dependency folders, build output, local environment files, and TypeScript incremental build files ignored.
- Preserve the decision that `movenet/` is local-only and not tracked.

**Non-Goals:**

- No migration to a separate frontend repository.
- No frontend implementation changes in this change.
- No dependency upgrades.

## Decisions

- Replace the broad `Fitness-ai-frontend/` ignore rule with explicit generated-file ignore rules. This allows source files and lockfiles to be staged normally while keeping large or machine-local outputs out of Git.
- Track `Fitness-ai-frontend/.gitignore` as an additional local safeguard for developers working inside the frontend directory.
- Keep `movenet/` ignored at the root because the model assets are intentionally local-only.

## Risks / Trade-offs

- Initial commit will add many frontend files -> This is expected because the frontend was previously hidden from Git.
- Accidentally tracking build artifacts -> Mitigated by root and frontend `.gitignore` rules plus status review before commit.
- Environment leakage -> `.env` remains ignored; `.env.example` can be tracked.
