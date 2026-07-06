# CV Evaluation Samples

This directory contains offline synthetic keypoint fixtures for pose scoring
regression tests. The samples do not include real user video, images, or
personal data.

## Format

`samples.json` stores a small recipe for each sample:

- `exercise_name`: backend exercise alias used by scoring rule lookup.
- `synthetic`: compact keypoint generation inputs.
- `expected`: stable output metadata that tests compare against.

The test loader expands each recipe into the same canonical pose-analysis shape
used by production scoring:

```text
pose_analysis.frames[*].keypoints[*] = { name, x, y, score }
```

## Adding Samples

Prefer adding synthetic keypoint recipes before committing any media artifact.
Each new sample should document the expected count, quality status, invalid
reasons when relevant, and representative movement error codes. Do not commit
real user videos, screenshots, raw uploads, names, device IDs, or other private
data in this fixture tree.
