## Why

Frontend AI features are currently implemented under `Fitness-ai-frontend/`, but the root repository ignores the entire directory. This means pushed OpenSpec history can describe frontend behavior that is not actually present in the remote source tree.

## What Changes

- Stop ignoring the entire `Fitness-ai-frontend/` directory from the root repository.
- Keep generated and sensitive frontend paths ignored, including `node_modules/`, `dist/`, `.env`, and TypeScript build info.
- Track frontend source, tests, package metadata, and build configuration as part of the project.

## Capabilities

### New Capabilities

### Modified Capabilities

- `openspec-repository-hygiene`: Repository hygiene rules now cover frontend source tracking and generated frontend artifacts.

## Impact

- Affected files: root `.gitignore`, `Fitness-ai-frontend/` source/config/test files, and repository hygiene spec.
- No runtime API changes.
- `movenet/` remains ignored and untracked.
