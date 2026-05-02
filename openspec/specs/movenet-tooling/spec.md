# Movenet Tooling Specification

## Purpose

Define the runtime dependency requirements for the local MoveNet experimentation tools so they function on Python 3.13.

## Requirements

### Requirement: TFLite interpreter fallback
The movenet tooling SHALL use a fallback import chain for the TFLite interpreter that supports Python 3.13.

#### Scenario: ai-edge-litert available
- **WHEN** ai-edge-litert is installed and tflite-runtime is not
- **THEN** `movenet_processor` imports the interpreter from `ai_edge_litert.interpreter`

#### Scenario: tensorflow.lite available
- **WHEN** neither tflite-runtime nor ai-edge-litert is installed but tensorflow is
- **THEN** `movenet_processor` imports the interpreter from `tensorflow.lite`

#### Scenario: no interpreter available
- **WHEN** none of tflite-runtime, ai-edge-litert, or tensorflow is installed
- **THEN** `movenet_processor` raises a clear ImportError with installation instructions

### Requirement: Backend fallback consistency
The backend `_load_optional_dependencies()` SHALL include `ai_edge_litert` in its fallback chain to match the movenet tooling.
