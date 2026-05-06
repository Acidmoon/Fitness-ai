## 1. Repository Contracts

- [x] 1.1 Convert training record create, update, and delete operations to suspendable result-bearing calls.
- [x] 1.2 Update mock/local repositories to satisfy the new contract without changing mock behavior.
- [x] 1.3 Add an exercise catalog model or repository surface for API-mode record editing.

## 2. API Record Mutations

- [x] 2.1 Implement backend exercise catalog refresh and expose selectable exercise options.
- [x] 2.2 Implement API record creation using `ExerciseRecordCreateDto`.
- [x] 2.3 Implement API record update using `ExerciseRecordUpdateDto`.
- [x] 2.4 Implement API record deletion using the backend delete endpoint.
- [x] 2.5 Refresh records and stats after successful API mutations.

## 3. UI and ViewModel Wiring

- [x] 3.1 Update record create/edit/delete ViewModel methods to handle async success/failure.
- [x] 3.2 Add API-mode exercise selection while preserving mock-mode free-form record entry.
- [x] 3.3 Display recoverable save/delete errors without clearing the authenticated session.

## 4. Verification

- [x] 4.1 Add unit tests for API record create/update/delete request bodies and refresh behavior.
- [x] 4.2 Add unit tests for exercise catalog loading and selected exercise mapping.
- [x] 4.3 Update existing mock repository and ViewModel tests for the new contract.
- [x] 4.4 Run `.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon`.
