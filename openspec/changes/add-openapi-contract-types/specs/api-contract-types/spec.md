## ADDED Requirements

### Requirement: Backend OpenAPI schema can be exported reproducibly
The system SHALL provide a developer command that exports the FastAPI OpenAPI schema without requiring a long-running server.

#### Scenario: Export OpenAPI schema
- **WHEN** a developer runs the documented OpenAPI export command
- **THEN** the command writes a deterministic OpenAPI schema artifact for the current backend routes and schemas

#### Scenario: Backend schema export fails
- **WHEN** the backend cannot build the OpenAPI schema because configuration or imports are invalid
- **THEN** the export command fails with a clear error

### Requirement: Frontend TypeScript contract types are generated or verified from OpenAPI
The system SHALL provide a frontend contract workflow that derives TypeScript API types from the exported OpenAPI schema.

#### Scenario: Generate frontend contract types
- **WHEN** a developer runs the documented contract generation command
- **THEN** TypeScript types for backend API paths, operations, request bodies, and responses are generated from OpenAPI

#### Scenario: Contract output is stale
- **WHEN** backend API schema changes but generated frontend contract types are not updated
- **THEN** the contract verification command fails

### Requirement: Frontend services can use generated API contracts
The frontend SHALL be able to reference generated API contract types when typing API client request and response behavior.

#### Scenario: Typed API response
- **WHEN** a frontend service function calls a backend endpoint with a generated response type
- **THEN** TypeScript checks the service against the OpenAPI-derived contract

#### Scenario: Contract-compatible manual migration
- **WHEN** existing handwritten frontend types still exist during migration
- **THEN** the project documents which generated contract types are authoritative for new or changed API work
