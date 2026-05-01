# Pose Analysis Runtime Specification

## Purpose

Define backend runtime behavior for MoveNet-based pose analysis, including configuration, model availability, frame inference, and normalized keypoint output.

## Requirements

### Requirement: Configurable MoveNet runtime
The system SHALL expose a backend MoveNet runtime that is configurable by environment and can be disabled when model files or native dependencies are unavailable.

#### Scenario: Runtime disabled
- **WHEN** pose analysis is disabled by configuration
- **THEN** the runtime reports that pose analysis is unavailable without importing native inference dependencies during application startup

#### Scenario: Model path configured
- **WHEN** pose analysis is enabled with a configured model path
- **THEN** the runtime validates that the model path resolves to a readable `.tflite` file before inference

#### Scenario: Model path missing
- **WHEN** pose analysis is enabled but the configured model file is missing
- **THEN** the runtime returns an explicit unavailable error

### Requirement: MoveNet model inference service
The system SHALL provide a backend service function that runs MoveNet inference against an image frame and returns normalized single-person keypoints.

#### Scenario: Successful frame inference
- **WHEN** the runtime receives a valid BGR image frame and a loaded MoveNet model
- **THEN** the runtime preprocesses the frame using the model input size
- **THEN** the runtime invokes the model
- **THEN** the runtime returns 17 named keypoints with coordinates and confidence scores

#### Scenario: Low-confidence keypoints retained
- **WHEN** MoveNet returns keypoints below the configured confidence threshold
- **THEN** the runtime retains the keypoints with their confidence scores so consumers can decide how to filter them

#### Scenario: Inference failure
- **WHEN** model invocation fails
- **THEN** the runtime returns a structured analysis error without crashing the API process

### Requirement: Runtime output metadata
The system SHALL include model and frame metadata with normalized pose outputs.

#### Scenario: Metadata included
- **WHEN** frame inference succeeds
- **THEN** the result includes model name, model input size, source frame dimensions, and confidence threshold
