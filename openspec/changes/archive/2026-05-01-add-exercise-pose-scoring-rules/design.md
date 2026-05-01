## Context

MoveNet provides 17 body keypoints per sampled frame. The existing exercise model has a `standard` JSON field, and exercise records have `score`, `count`, and `feedback`. Those fields can represent AI-derived results, but the scoring logic needs to be explicit and traceable.

## Goals / Non-Goals

**Goals:**
- Build a deterministic scoring layer for pose analysis results.
- Start with a small set of exercises and explicit rules.
- Calculate joint angles and movement phases from keypoints.
- Produce explainable feedback messages.
- Avoid silent overwrites of user-entered scores unless analysis is explicitly applied.

**Non-Goals:**
- No machine-learned custom scoring model in this change.
- No multi-person analysis.
- No real-time coaching.
- No complete coverage of every exercise in the catalog.

## Decisions

- Use rule-based scoring first. It is easier to validate, test, and explain than a learned scoring model.
- Use `Exercise.standard` as the source of configurable thresholds where possible.
- Separate metric extraction from scoring. Angle and phase utilities should be testable independently.
- Require explicit application of AI scoring results. Users should understand when `score`, `count`, or `feedback` changes.

## Risks / Trade-offs

- Rule accuracy varies by camera angle -> Include confidence and visibility checks before scoring.
- Exercise standards may be incomplete -> Return "insufficient rule configuration" instead of guessing.
- Sampled frames can miss rep transitions -> Use conservative sampling requirements and warn when confidence is low.
- Updating score/count affects stats -> Make AI application explicit and test downstream behavior.
