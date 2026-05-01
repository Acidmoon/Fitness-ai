## 1. Login Throttling

- [x] 1.1 Add a shared in-process login failure limiter keyed by client scope and configurable retry window
- [x] 1.2 Enforce the limiter in `POST /api/auth/login`, incrementing only failed attempts and clearing state on successful login
- [x] 1.3 Add auth tests for repeated failed logins, scope isolation, and successful-login reset behavior

## 2. Upload Content Validation

- [x] 2.1 Add upload validation helpers that compare supported extension, declared MIME type, and detected file signature
- [x] 2.2 Enforce the new validation gate in the video upload route before streaming any file to disk
- [x] 2.3 Add video upload tests for mismatched MIME, disguised non-video payloads, and accepted supported signatures

## 3. Verification

- [x] 3.1 Run focused auth and video pytest modules for the new controls
- [x] 3.2 Run the full backend pytest suite and validate the OpenSpec change
