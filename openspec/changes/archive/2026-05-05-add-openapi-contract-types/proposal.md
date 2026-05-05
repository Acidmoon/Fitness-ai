## Why

The backend exposes OpenAPI automatically, but frontend request and response types are currently handwritten. As the frontend and backend split into separate deployable units, generated or verified API contracts are needed to catch drift before runtime.

## What Changes

- Add an API contract tooling workflow based on the FastAPI OpenAPI schema.
- Generate or validate frontend TypeScript API types from the backend contract.
- Add contract verification to local/CI commands so backend schema changes surface frontend type drift.
- Document when generated files should be updated.
- No API routes are added or removed by this change.

## Capabilities

### New Capabilities

- `api-contract-types`: OpenAPI schema export and frontend TypeScript contract generation or validation.

### Modified Capabilities

- None

## Impact

- Affected backend code/scripts: OpenAPI export script or command, tests around schema generation.
- Affected frontend code/scripts: generated type location, package scripts, service typings.
- Dependencies may include an OpenAPI-to-TypeScript generator.
- Operational impact: build or CI should fail when contract generation output is stale.
