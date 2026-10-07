---
status: resolved
---

# fix(desktop): a settings or sync file that has gone comes back from its last good copy

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Appended by converge round 1 (2026-10-07).

## Outcome

A persisted record whose file is missing while its `.bak` is readable is restored from the copy rather than started from defaults, so no held organization is lost because one file vanished.

## Acceptance Criteria

Traces requirement 17 (its constraint: the held organizations are carried over wherever a good copy exists).

- [x] `Persisted::recover` reads the `.bak` when the primary is missing, and writes the primary back from it before any commit can overwrite the copy.
- [x] A Rust test removes `remote-sync.json` with a good `.bak` beside it and finds both organizations after launch; a missing file with no copy still starts from defaults.

## Relevant areas

- `apps/desktop/tauri/src/persisted.rs`
- `apps/desktop/tauri/src/machine/record.rs`

## Constraints

- Rust tests run with `--test-threads=1` and a `CARGO_TARGET_DIR` of the implementer's own outside the worktree path (Windows path limit).
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
