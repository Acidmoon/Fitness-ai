# Exercise Pose Scoring Specification

## Purpose

Define deterministic scoring behavior that converts stored pose analysis keypoints into exercise metrics, repetition counts, scores, and corrective feedback.

## Requirements

### Requirement: Pose-derived exercise metrics
The system SHALL calculate exercise metrics from stored pose analysis keypoints when the required keypoints have sufficient confidence.

#### Scenario: Metrics calculated
- **WHEN** stored pose analysis contains the required keypoints above confidence thresholds
- **THEN** the system calculates configured joint angles, movement ranges, and visibility metrics

#### Scenario: Insufficient confidence
- **WHEN** required keypoints are missing or below confidence thresholds
- **THEN** the system marks scoring as unavailable and explains which signal is insufficient

### Requirement: Rule-based exercise scoring
The system SHALL score supported exercises using deterministic rules derived from exercise standards and pose metrics.

#### Scenario: Supported exercise scored
- **WHEN** a record belongs to a supported exercise and has valid pose analysis data
- **THEN** the system generates a score from configured movement rules
- **THEN** the system returns rule-level feedback explaining major deductions

#### Scenario: Unsupported exercise
- **WHEN** a record belongs to an exercise without configured pose scoring rules
- **THEN** the system returns an unsupported status without modifying the record

#### Scenario: Repetition count generated
- **WHEN** configured movement phases can be detected from the pose sequence
- **THEN** the system returns an estimated repetition count with confidence metadata

### Requirement: Explicit application of AI scoring
The system SHALL apply AI-generated score, count, and feedback to an exercise record only through an explicit user or API action.

#### Scenario: Apply scoring result
- **WHEN** an authenticated active user applies a scoring result to an owned record
- **THEN** the system updates the record score, count, and feedback with the generated values

#### Scenario: Preview scoring result
- **WHEN** an authenticated active user requests scoring without applying it
- **THEN** the system returns the generated values without modifying the record

#### Scenario: Missing pose analysis
- **WHEN** a user attempts to score a record without pose analysis data
- **THEN** the system returns `400 Bad Request`
