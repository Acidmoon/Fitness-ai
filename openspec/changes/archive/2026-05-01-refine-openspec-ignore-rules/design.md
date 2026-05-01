## Context

The current repository ignores `.codex/` and `openspec/changes/` globally. Ignoring `.codex/` is desirable because it is a local tool workspace, but ignoring all of `openspec/changes/` conflicts with the intended OpenSpec lifecycle because archived changes are useful project records and should be committed. The current workaround requires forcing archived files into Git.

## Goals / Non-Goals

**Goals:**
- Ignore active working change directories by default.
- Allow `openspec/changes/archive/` contents to be tracked normally.
- Avoid requiring `git add -f` for archived changes.

**Non-Goals:**
- Change the structure of OpenSpec directories.
- Add automation around archive commits.
- Modify any application code.

## Decisions

Use a targeted ignore rule for direct child change directories and a negation rule for `archive/`.
This keeps active changes untracked by default while allowing archived changes to be committed normally. It solves the exact pain point without broad repository changes.
Alternative considered: remove all `openspec/changes/` ignore rules. Rejected because active local change drafts should still stay out of normal commits until intentionally archived.

Keep `.codex/` ignored as-is.
The `.codex/` workspace is tool-local state and does not participate in the repository history.
Alternative considered: stop ignoring `.codex/`. Rejected because it would add noisy local-only artifacts.

## Risks / Trade-offs

- [Pattern mismatch could still ignore archive content] → Validate with `git check-ignore` against both active and archived paths after changing `.gitignore`.
- [Users may expect active changes to be tracked automatically] → Preserve current local-draft behavior and rely on archive as the point where changes enter repository history.

## Migration Plan

Update `.gitignore` patterns, validate the resulting Git behavior, and use the new pattern going forward. No rollback complexity exists beyond reverting the ignore rule if needed.

## Open Questions

- Whether the repository should eventually include a documented convention for when active changes are intentionally staged before archive.
