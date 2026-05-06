## Why

The API foundation includes typed DTOs for most backend contracts, but some stats endpoints still use broad `Map<String, String>` placeholders even though the backend returns numeric values. Tightening those DTOs now prevents serialization failures when stats integration moves beyond the foundation layer.

## What Changes

- Replace broad stats endpoint placeholders with typed DTOs matching current backend response shapes.
- Add mapper coverage for weekly stats and personal-best responses where Android needs domain or view-model values.
- Add representative JSON parsing tests for numeric stats fields and optional/null backend values.
- Document that API DTOs should model backend numeric fields as numeric Kotlin types, not string maps.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `android-api-foundation`: Tighten backend DTO requirements so stats contract DTOs use precise types for all known backend responses.

## Impact

- Affected Android code: Stats Retrofit service interfaces, API DTOs, mapper tests, and any future stats repository integration points.
- No backend API changes.
- No UI behavior changes in mock mode.
