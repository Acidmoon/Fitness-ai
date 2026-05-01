## ADDED Requirements

### Requirement: Pose analysis result enables scoring handoff
The frontend SHALL present pose scoring as a follow-up action after a record has completed pose analysis.

#### Scenario: Analysis complete
- **WHEN** the record detail page has a completed pose analysis result
- **THEN** the AI area offers a control to preview pose scoring

#### Scenario: Analysis not complete
- **WHEN** pose analysis is idle, failed, loading, or unavailable
- **THEN** the page explains that pose analysis must complete before scoring can run

#### Scenario: Analysis rerun
- **WHEN** the user reruns pose analysis successfully
- **THEN** stale pose scoring preview data is cleared or refreshed before the user applies scoring
