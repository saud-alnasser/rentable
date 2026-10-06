---
status: resolved
---

# fix(desktop): the app says plainly, in both languages, why it cannot start

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Raised by review round 1 (2026-10-07).

## Outcome

When a settings or sync file is locked or unreadable for want of permission, the message the app shows before it stops is a plain sentence naming the file, in Arabic and English, and the raw reason goes to the log.

## Acceptance Criteria

Traces requirement 17 and criterion 17.

- [x] `lib.rs`'s startup failure message has a bilingual title and a plain sentence naming the file and what to do, never the error's developer text (`rules/api-layer`, *Errors*); the raw reason is logged under a stable name.
- [x] A Rust test pins the message text built for a locked record (both languages, the file named, no raw error text) without opening a dialog.

## Relevant areas

- `apps/desktop/tauri/src/lib.rs`
- `apps/desktop/tauri/src/persisted.rs`

## Constraints

- Rust tests run with `--test-threads=1` and a `CARGO_TARGET_DIR` of the implementer's own outside the worktree path (Windows path limit).
- A changeset only where a user observes something no entry of this effort already says; otherwise extend nothing and say so in Notes ([[references/changesets]]).
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).

## Notes

No changeset: `a-damaged-settings-file-no-longer-stops-the-app.md`, ticket 17's entry, already tells the user the file is named in a message instead of a crash; this ticket changes how that message reads, not what the user is told happens.
