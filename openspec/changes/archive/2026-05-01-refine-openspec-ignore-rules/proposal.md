## Why

The repository currently ignores the entire `openspec/changes/` tree, which also hides archived changes that are supposed to be committed as project history. That forces manual `git add -f` during every archive flow and makes the OpenSpec process brittle.

## What Changes

- Narrow the Git ignore rules so only active local OpenSpec working changes remain ignored by default.
- Keep archived OpenSpec changes trackable without requiring forced Git adds.
- Add a small validation step to confirm archived change paths are no longer ignored.

## Capabilities

### New Capabilities
- `openspec-repository-hygiene`: Define repository rules for ignoring local OpenSpec working directories while preserving archived changes as trackable project artifacts.

### Modified Capabilities

## Impact

- Affected files are expected to be repository metadata only, primarily `.gitignore` and OpenSpec change artifacts.
- No backend API behavior or runtime dependency changes are involved.
