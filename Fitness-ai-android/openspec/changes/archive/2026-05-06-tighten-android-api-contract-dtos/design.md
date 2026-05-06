## Context

The Android API foundation added Retrofit services and DTOs for backend contract areas. Most DTOs are structured, but `StatsApiService.getWeeklyStats()` and `getPersonalBest()` currently use `List<Map<String, String>>` placeholders even though the FastAPI backend returns numeric fields. This is likely to break kotlinx.serialization when the stats repository is integrated.

## Goals / Non-Goals

**Goals:**
- Replace broad stats map placeholders with typed DTOs that match backend response shapes.
- Cover numeric and optional stats fields with JSON parsing tests.
- Provide mapper functions or conversion helpers needed by future API-backed stats repositories.
- Keep existing mock stats behavior unchanged.

**Non-Goals:**
- Implement a full API-backed stats repository.
- Change backend stats endpoints or schemas.
- Redesign the Stats UI.
- Generate Android DTOs from OpenAPI automatically.

## Decisions

### Model stats endpoint responses explicitly

Weekly stats should be modeled with typed date/session/average-score fields. Personal-best responses should model exercise name, best score, and best count as numeric-capable DTO fields. `Map<String, String>` was convenient for scaffolding but does not match backend JSON and prevents useful mapper tests.

### Keep DTOs separate from UI/domain models

New DTOs should remain in the API layer and map into existing or future Android domain/view-model values. This keeps Compose screens isolated from backend field naming and optionality. Directly exposing DTOs to UI was considered, but it would repeat the coupling this API layer is intended to avoid.

### Test representative backend JSON

Tests should decode JSON shaped like the FastAPI responses, including numeric values, missing optional fields where allowed, and zero/empty response cases. These tests give early warning if Android DTOs drift from backend contracts.

## Risks / Trade-offs

- Backend response model remains informal for some endpoints -> Use current route code and tests as the source until backend adds explicit response models.
- Mappers may be underused before repository integration -> Keep them small and focused on future stats repository needs.
- Numeric type mismatch between int and float -> Use Kotlin types that safely parse the backend values and convert deliberately in mappers.

## Migration Plan

1. Add typed DTOs for weekly stats and personal-best responses.
2. Update StatsApiService return types.
3. Add parsing and mapper tests with representative backend JSON.
4. Keep mock mode stats derived from local records until a later API stats repository change.

## Open Questions

- Should backend stats endpoints add explicit Pydantic response models before Android starts relying on these response shapes more broadly?
