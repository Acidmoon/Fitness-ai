## Why

Backend pose analysis can produce movement data, but the Android app still needs a clear path to request scoring, show feedback, and apply score/count updates to the backend record. This closes the loop from video analysis to actionable training results.

## What Changes

- Add API-mode pose-scoring behavior after backend pose analysis is available.
- Show score, count, confidence, and feedback returned by the backend scoring endpoint.
- Support applying backend scoring results to the training record when requested.
- Refresh records and stats after applied scoring changes.
- Preserve mock-mode simulated score preview behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `android-simulated-analysis`: Analysis results gain API-mode scoring and feedback behavior.
- `android-training-records`: Applied API scoring updates SHALL be reflected in record list/detail and aggregate stats.

## Impact

- Affected Android code: analysis/scoring repository behavior, record detail UI, mapper tests, ViewModel refresh flow, and API scoring tests.
- No backend changes.
- Depends on API pose-analysis jobs from `add-android-api-pose-analysis-jobs`.
