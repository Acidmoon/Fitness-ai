## 1. Stats DTO Contract

- [x] 1.1 Add typed DTOs for backend weekly stats responses with date, sessions, and average score fields.
- [x] 1.2 Add typed DTOs for backend personal-best responses with exercise name, best score, and best count fields.
- [x] 1.3 Update `StatsApiService` to return the typed DTOs instead of broad string maps.

## 2. Mappers and Tests

- [x] 2.1 Add mapper or conversion helpers for the new stats DTOs where future API-backed stats repositories will need them.
- [x] 2.2 Add JSON parsing tests for weekly stats responses containing numeric values.
- [x] 2.3 Add JSON parsing tests for personal-best responses containing numeric values and empty response lists.
- [x] 2.4 Update existing mapper tests if needed so stats DTO coverage reflects current backend JSON shapes.

## 3. Verification

- [x] 3.1 Run `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon`.
- [x] 3.2 Confirm mock mode stats behavior still derives from local records and is unchanged by DTO tightening.
