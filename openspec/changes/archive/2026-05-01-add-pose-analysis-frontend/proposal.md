## Why

The record detail page already reserves space for AI results, but users cannot start pose analysis or inspect stored pose data. The frontend needs a small workflow that connects uploaded videos to the new backend analysis endpoints.

## What Changes

- Add frontend service methods for triggering and retrieving pose analysis.
- Extend exercise record types or analysis-specific types to represent stored pose analysis summaries.
- Add record detail UI states for idle, ready to analyze, processing, analyzed, and failed.
- Display analysis summary metrics and compact keypoint status in the existing AI result area.
- Add focused frontend tests for the analysis workflow.

## Capabilities

### New Capabilities
- `pose-analysis-frontend`: Defines the frontend behavior for triggering and viewing pose analysis from the record detail page.

### Modified Capabilities

## Impact

- Affected frontend areas: `Fitness-ai-frontend/src/services`, `Fitness-ai-frontend/src/types`, `RecordDetailPage.tsx`, tests, styles.
- Depends on the backend pose analysis API.
- No backend behavior changes in this change.
