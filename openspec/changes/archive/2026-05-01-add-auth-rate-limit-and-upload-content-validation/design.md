## Context

The backend now rejects inactive logins and resolves JWT subjects safely, but the login endpoint still allows unlimited retry volume. In the same vein, video uploads now have stronger lifecycle semantics after persistence, yet the acceptance gate still relies primarily on the filename extension supplied by the client. Both gaps are pre-storage or pre-authentication abuse surfaces rather than post-auth correctness problems.

This change remains intentionally narrow. It does not expand into generic API-wide rate limiting or a full media processing pipeline. It focuses on two controls close to the edge: throttling repeated login failures and verifying that accepted uploads are plausibly real video files of supported types.

## Goals / Non-Goals

**Goals:**
- Throttle abusive repeated login attempts with deterministic and testable behavior.
- Keep legitimate login traffic working while limiting repeated failures from the same client scope.
- Verify uploaded video content using more than the file extension.
- Reject obvious disguised or mismatched non-video payloads before they are persisted to disk.
- Add regression tests that lock the new auth and upload gate behavior in place.

**Non-Goals:**
- Introduce a full distributed rate-limit service or shared cache dependency in this iteration.
- Rate-limit every authenticated or anonymous API endpoint.
- Perform deep transcoding, codec validation, or media duration analysis.
- Replace the current upload storage model or move uploads to object storage.

## Decisions

Use a small in-process rate-limit tracker for login attempts in this iteration.
The current backend runs as a simple FastAPI service with no existing Redis or gateway-level limiter. A narrow in-memory limiter is enough to define semantics, close the immediate gap, and keep the implementation aligned with the project's present complexity level. The design should isolate the limiter behind a helper so a future shared backend can replace it without changing route semantics.
Alternative considered: require Redis or a proxy-level limiter immediately. Rejected because it adds operational dependencies out of proportion to this narrow hardening step.

Rate-limit by a composite client scope tied to request source and username.
Using only IP is too blunt for NATed users, while using only username is too easy to distribute across addresses. A composite scope such as sanitized client IP plus submitted username provides a pragmatic first barrier and keeps tests straightforward.
Alternative considered: username-only or IP-only throttling. Rejected because each alone creates either too many false positives or too weak a barrier.

Count failed login attempts and reset the window on successful authentication.
The threat here is repeated failures, not normal successful use. Limiting only failures reduces friction for valid users while still suppressing brute-force retries. A successful login should clear or age out the failure state for that client scope.
Alternative considered: count every login attempt. Rejected because it would throttle normal usage unnecessarily.

Validate uploads by checking extension, declared MIME, and file signature header.
The backend does not need full media parsing to reject obvious disguises. A layered check catches most low-effort abuse: the extension must be allowed, the request MIME should be compatible with the extension, and the initial bytes should match one of the supported container signatures where applicable. If signature verification is inconclusive for a supported container, the policy should fail closed unless there is a documented compatibility exception.
Alternative considered: MIME-only or extension-only filtering. Rejected because both are client-controlled and trivial to spoof.

Keep the content validation near the upload route rather than in generic middleware.
The accepted format policy is specific to video uploads and tied to existing upload constants and error messages. A route-adjacent helper keeps the logic easy to test and avoids over-generalizing file validation before there is another file-upload surface.
Alternative considered: global upload middleware. Rejected because the project currently has only one upload path and no generalized file abstraction.

## Risks / Trade-offs

- [In-memory limiter is per-process and not shared across replicas] → Isolate the limiter implementation and document that a distributed backend is the next step if horizontal scaling becomes relevant.
- [Composite scope may still throttle some shared-network users] → Limit only repeated failures, keep the window modest, and cover success reset semantics in tests.
- [File signature checks may reject some unusual but valid containers] → Start with the supported formats already exposed by the API and document exactly which signatures are accepted.
- [MIME checks depend on client-supplied headers] → Treat MIME as one signal only and require it to agree with extension and signature rather than trusting it alone.

## Migration Plan

Implement auth throttling first, because it changes request admission behavior and is independent of file upload code.

Implement upload content validation second, reusing the existing streaming path after the new gate passes.

Run focused auth and video tests, then the full backend pytest suite. If throttling behavior proves too aggressive in practice, rollback is limited to the auth limiter helper and route-level checks without disturbing the previously completed hardening work.

## Open Questions

- What exact failure threshold and cooldown window should be considered acceptable for the user population.
- Whether `.avi` and `.mkv` support needs broader signature coverage than the initial implementation can safely provide.
- Whether rate-limit state should surface retry-after metadata to clients in this iteration or remain a simple `429 Too Many Requests` response.
