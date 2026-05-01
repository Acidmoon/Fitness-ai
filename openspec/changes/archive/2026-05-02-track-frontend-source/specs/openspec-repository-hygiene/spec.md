## ADDED Requirements

### Requirement: Frontend source remains trackable
The repository SHALL track frontend source, tests, package metadata, and build configuration needed to reproduce the frontend application.

#### Scenario: Frontend source changes
- **WHEN** a developer modifies source or tests under `Fitness-ai-frontend/src/`
- **THEN** Git reports those changes as trackable repository changes

#### Scenario: Frontend package metadata changes
- **WHEN** package metadata or lockfiles under `Fitness-ai-frontend/` change
- **THEN** Git reports those files as trackable repository changes

### Requirement: Frontend generated artifacts remain ignored
The repository SHALL ignore generated or machine-local frontend artifacts.

#### Scenario: Dependencies installed
- **WHEN** dependencies are installed under `Fitness-ai-frontend/node_modules/`
- **THEN** Git does not report dependency files as trackable changes

#### Scenario: Production build generated
- **WHEN** a frontend build writes files under `Fitness-ai-frontend/dist/`
- **THEN** Git does not report build output as trackable changes

#### Scenario: Local environment configured
- **WHEN** a developer creates `Fitness-ai-frontend/.env`
- **THEN** Git does not report the local environment file as a trackable change
