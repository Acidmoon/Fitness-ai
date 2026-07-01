# Repository AGENTS.md — Fitness AI

## Scope

These instructions apply to the entire repository unless a more specific `AGENTS.md` exists in a subdirectory.

## Core Coding Workflow

When writing or changing code, always use a first-principles workflow:

1. Identify the required behavior change.
2. Identify invariants that must remain true.
3. Inspect the relevant code, tests, schemas, configuration, and call sites before editing.
4. Choose the smallest implementation that satisfies the behavior and preserves the invariants.
5. Prefer existing repository patterns, abstractions, dependencies, and style.
6. Verify with the most relevant tests, type checks, lint, build, or focused manual checks available.

## Mandatory Adversarial Review

After every code change, perform an adversarial self-review before finalizing. This step is mandatory and must not be skipped.

Review at minimum:

- Inputs, edge cases, and invalid states that could break the change.
- Existing behavior that might regress.
- Async, concurrency, lifecycle, cleanup, permission, security, and error paths.
- Data consistency across database, filesystem, API contracts, Web client, and Android client when relevant.
- Whether tests cover the highest-risk path.
- Whether a smaller or more idiomatic implementation exists.

If the review finds an in-scope issue, fix it and re-run the relevant verification before finalizing.

## Completion Requirements

For implementation tasks, do not stop after a proposal when code changes were requested.

Before reporting completion:

1. Summarize the first-principles conclusion that drove the change.
2. Summarize the adversarial review result.
3. Report verification commands and outcomes.
4. Commit the completed changes.
5. Push the commit to the configured remote branch.

If commit or push cannot be completed, clearly report the blocker and the exact command or error.

## Safety

- Do not overwrite, revert, delete, or reset user changes unless explicitly requested.
- Do not run destructive commands without explicit confirmation.
- Do not expose secrets, tokens, cookies, private keys, credentials, or personal data.
- Do not claim verification passed unless it was actually run.
- Keep changes minimal and scoped to the user's request.

