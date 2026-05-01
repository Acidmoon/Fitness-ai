## 1. Streamed Upload Handling

- [x] 1.1 Add a streamed video write helper that writes chunks, tracks final size, and rejects oversized uploads during persistence
- [x] 1.2 Update the upload endpoint to use the streamed write helper and preserve cleanup on failure

## 2. Regression Coverage

- [x] 2.1 Add tests for streamed oversize rejection and partial-file cleanup on write failure
- [x] 2.2 Keep existing upload behavior coverage passing for normal, replacement, and temporary upload flows

## 3. Verification

- [x] 3.1 Run backend tests covering the updated upload behavior
- [x] 3.2 Validate the OpenSpec change before syncing and archiving
