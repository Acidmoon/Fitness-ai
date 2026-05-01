## 1. Metric Extraction

- [x] 1.1 Add utilities for joint angle calculation from named keypoints
- [x] 1.2 Add utilities for visibility and confidence gating
- [x] 1.3 Add movement phase extraction helpers for sampled frame sequences

## 2. Scoring Rules

- [x] 2.1 Define initial supported exercises and required keypoints
- [x] 2.2 Add rule-based scoring for at least one lower-body movement
- [x] 2.3 Add rule-based scoring for at least one upper-body movement
- [x] 2.4 Generate structured feedback from failed or weak scoring checks

## 3. Application Flow

- [x] 3.1 Add an explicit backend flow to apply AI score/count/feedback to a record
- [x] 3.2 Prevent scoring when pose analysis is missing, stale, or low confidence
- [x] 3.3 Preserve user-entered values unless AI scoring is explicitly applied

## 4. Tests

- [x] 4.1 Add unit tests for angle and phase helpers
- [x] 4.2 Add unit tests for supported exercise scoring rules
- [x] 4.3 Add API or service tests for explicit score application
- [x] 4.4 Run focused backend tests and `openspec validate`
