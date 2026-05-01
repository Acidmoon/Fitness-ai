## Why

MoveNet keypoints alone do not produce exercise scores, repetition counts, or corrective coaching. After pose analysis exists, the project needs a structured scoring layer that converts keypoints into exercise-specific metrics and feedback.

## What Changes

- Add a scoring service that consumes stored pose analysis data and exercise standards.
- Define rule-based scoring for selected initial exercises.
- Generate score, count, and feedback from pose-derived metrics.
- Store scoring outputs on exercise records without overwriting user-provided data unexpectedly.
- Add tests for angle calculations, repetition detection, and feedback generation.

## Capabilities

### New Capabilities
- `exercise-pose-scoring`: Defines rule-based scoring and feedback behavior built on top of pose analysis results.

### Modified Capabilities

## Impact

- Affected backend areas: exercise standards, pose analysis data consumers, exercise record update flow, tests.
- Depends on the video pose analysis API and stored keypoint summaries.
- May later influence dashboard statistics because scores and counts can become AI-generated.
