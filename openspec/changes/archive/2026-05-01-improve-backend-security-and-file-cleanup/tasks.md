## 1. Runtime Configuration Safety

- [x] 1.1 Add settings validation that rejects placeholder or missing critical values for `SECRET_KEY` and `DATABASE_URL`
- [x] 1.2 Add focused tests covering valid configuration loading and failure cases for insecure defaults

## 2. Uploaded Video Lifecycle

- [x] 2.1 Extract shared helpers for resolving, validating, and deleting owned uploaded video files
- [x] 2.2 Update video upload flow to clean up replaced files and roll back newly written files on database failure
- [x] 2.3 Update single-record delete, batch-record delete, and account delete flows to remove associated uploaded video files

## 3. Verification

- [x] 3.1 Add regression tests for video replacement, record deletion, batch deletion, and account deletion file cleanup
- [x] 3.2 Run backend tests and OpenSpec validation for the completed change
