## Why

The repository now contains a standalone `movenet/` toolset, but it is not part of the backend runtime, dependency model, or service boundary. Before building user-facing pose analysis, the project needs a stable MoveNet runtime foundation that can load models, run inference, and return structured keypoints without command-line side effects.

## What Changes

- Introduce a backend MoveNet runtime service boundary for loading TFLite models and running single-person pose inference.
- Normalize MoveNet outputs into a project-owned keypoint schema with model metadata, frame metadata, and confidence values.
- Add runtime configuration for model path, model type, confidence threshold, sampling defaults, and feature enablement.
- Keep demo scripts and sample inputs out of the production API path.
- Add tests around model-path resolution, disabled runtime behavior, output normalization, and dependency failure handling.

## Capabilities

### New Capabilities
- `pose-analysis-runtime`: Defines backend runtime behavior for MoveNet model configuration, model loading, inference, and normalized keypoint output.

### Modified Capabilities

## Impact

- Affected backend areas: `app/config.py`, new pose analysis service utilities, dependency management, tests.
- External dependencies: OpenCV, NumPy, and TensorFlow Lite runtime or a compatible TensorFlow Lite interpreter package.
- Operational impact: deployment must provide compatible model files and Python runtime support before pose analysis can be enabled.
