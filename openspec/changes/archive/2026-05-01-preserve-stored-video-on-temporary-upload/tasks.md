## 1. Upload Flow Correction

- [x] 1.1 Ensure `keep_video=false` does not clear an existing stored `video_url` or delete the previous owned file
- [x] 1.2 Keep permanent upload replacement behavior unchanged for `keep_video=true`

## 2. Regression Coverage

- [x] 2.1 Add tests for temporary uploads on records that already have stored videos
- [x] 2.2 Keep replacement and temporary-upload cleanup behavior covered

## 3. Verification

- [x] 3.1 Run backend tests covering video upload behavior
- [x] 3.2 Validate the OpenSpec change before syncing and archiving
