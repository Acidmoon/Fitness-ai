# OpenSpec Repository Hygiene Specification

## Purpose

Define repository rules for ignoring local OpenSpec working directories while preserving archived changes as trackable project history.

## Requirements

### Requirement: Active OpenSpec working changes stay ignored by default
The repository SHALL ignore direct child directories under `openspec/changes/` that represent active local working changes.

#### Scenario: New active change is created
- **WHEN** a developer creates a new change under `openspec/changes/<change-name>/`
- **THEN** Git does not include that active change in normal status output by default

### Requirement: Archived OpenSpec changes remain trackable
The repository SHALL allow content under `openspec/changes/archive/` to be tracked without forced Git adds.

#### Scenario: Change is archived
- **WHEN** a completed change is moved under `openspec/changes/archive/<date>-<change-name>/`
- **THEN** Git treats the archived files as trackable paths
- **THEN** the archive can be staged without using force-add options
