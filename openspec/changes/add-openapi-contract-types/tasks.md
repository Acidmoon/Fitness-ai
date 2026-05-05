## 1. Tooling

- [x] 1.1 Add a backend command or script to export `app.main.app.openapi()` deterministically.
- [x] 1.2 Choose and add an OpenAPI-to-TypeScript generator to the frontend toolchain.
- [x] 1.3 Add package scripts for generating and checking API contract types.
- [x] 1.4 Decide and document whether the OpenAPI JSON artifact is committed.

## 2. Type Integration

- [x] 2.1 Generate initial frontend API contract types.
- [x] 2.2 Identify endpoints missing explicit response models or schemas.
- [x] 2.3 Update selected frontend service functions to reference generated contract types.
- [x] 2.4 Keep handwritten domain types only where they add frontend-specific view-model value.

## 3. Documentation

- [x] 3.1 Document contract generation and verification commands.
- [x] 3.2 Document the expected workflow when backend routes or schemas change.

## 4. Verification

- [x] 4.1 Add a check that fails when generated contract output is stale.
- [x] 4.2 Run the OpenAPI export command.
- [x] 4.3 Run the frontend contract generation/check command.
- [x] 4.4 Run `pytest`.
- [x] 4.5 Run `cd Fitness-ai-frontend && npm run build`.
