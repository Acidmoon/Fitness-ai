## Context

FastAPI already exposes `/openapi.json`, while the frontend maintains TypeScript interfaces manually under `src/types`. That works early on, but split deployments make contract drift more expensive because frontend and backend can ship independently. A generated or validated contract gives both sides a stable boundary.

## Goals / Non-Goals

**Goals:**
- Export the backend OpenAPI schema deterministically.
- Generate TypeScript contract types or validate existing types against the schema.
- Add scripts that developers and CI can run before deployment.
- Keep generated artifacts predictable and reviewable.

**Non-Goals:**
- Rewrite all frontend service functions in this change unless required by the chosen generator.
- Introduce a separate API gateway.
- Version every API route immediately.
- Change backend response schemas beyond making them explicit enough for OpenAPI.

## Decisions

- Use FastAPI's OpenAPI schema as the source of truth.
  Rationale: schemas already live in Pydantic models and route decorators, so this avoids maintaining a parallel API definition.

- Add a committed or reproducibly generated frontend type artifact.
  Rationale: frontend code needs local TypeScript types without requiring the backend server to be running during normal editing.

- Add a verification command that detects stale contract output.
  Rationale: generation only helps if drift fails before merge or deployment.

## Risks / Trade-offs

- Generated types can be noisy in reviews -> Mitigation: keep output in a dedicated file or folder and document regeneration commands.
- Some existing endpoints may lack precise response models -> Mitigation: identify missing response models as implementation tasks.
- Generator choice may add Node dependency weight -> Mitigation: choose a maintained generator and pin it through `package-lock.json`.

## Migration Plan

1. Add a backend OpenAPI export command.
2. Choose and configure TypeScript generation.
3. Generate initial contract types.
4. Incrementally align frontend services to generated types where valuable.
5. Add verification to fail on stale generated output.

## Open Questions

- Should generated types replace all existing `src/types/*` files or coexist initially?
- Should the OpenAPI JSON artifact be committed, or generated during verification only?
