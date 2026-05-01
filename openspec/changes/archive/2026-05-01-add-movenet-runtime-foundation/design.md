## Context

The `movenet/` folder is currently a local demo-style toolset with command-line scripts, sample media, TFLite models, and a core processor. The backend runs on Python 3.13, while the bundled `tflite_runtime` wheel targets Python 3.10, so dependency compatibility must be handled explicitly before runtime integration.

The production backend already stores exercise record metadata and has a `keypoints_data` JSON field, but it lacks a reusable service that can safely run pose inference and return structured data.

## Goals / Non-Goals

**Goals:**
- Create a backend-owned MoveNet runtime boundary that is importable from FastAPI code.
- Load configured TFLite models through a small service API and cache the interpreter per process.
- Return normalized keypoint data independent of CLI printing, OpenCV windows, or demo output files.
- Make the runtime disabled by default unless model dependencies and paths are configured.
- Provide tests that do not require real model inference by using mocks/fakes.

**Non-Goals:**
- No public pose analysis API in this change.
- No frontend changes in this change.
- No exercise scoring or repetition counting in this change.
- No background job queue in this change.
- No commitment to storing large model files in Git.

## Decisions

- Use a new backend service module instead of importing `process_video.py` directly. The existing script mixes validation, progress printing, video writing, preview windows, and inference, which is not a stable API boundary.
- Keep model files configurable by path. The current model files are large and environment-specific, so deployment should decide whether to keep them in the repository, mount them, or download them during provisioning.
- Cache the interpreter in-process. Loading the model on every request would be slow; a small singleton/factory is enough for the first backend integration.
- Normalize output into dictionaries with `name`, `x`, `y`, and `score`. This keeps consumers independent of MoveNet's raw `(y, x, confidence)` tensor layout.
- Add feature flags and clear disabled behavior. Environments without compatible native dependencies should fail predictably rather than breaking app startup.

## Risks / Trade-offs

- Native dependency mismatch -> Gate runtime behind configuration and document Python/package compatibility.
- Large model artifacts in Git -> Prefer configurable paths and document model placement before committing model files.
- TFLite interpreter thread safety -> Avoid sharing mutable inference calls across concurrent requests without a lock or per-worker interpreter strategy.
- CPU-heavy inference -> Keep this change limited to runtime readiness; public API and background execution are handled separately.
