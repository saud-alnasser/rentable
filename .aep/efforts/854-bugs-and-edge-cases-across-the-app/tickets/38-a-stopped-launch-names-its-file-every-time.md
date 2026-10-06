---
status: resolved
---

# fix(desktop): a stopped launch names its file every time, and a failed commit leaves nothing open

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Raised by review round 2 (2026-10-07).

## Outcome

Every path by which a settings, sync or update file cannot be written at launch names that file in the message the app shows, the message reads in one case style, and a write transaction whose COMMIT fails is rolled back at once.

## Acceptance Criteria

Traces requirements 15 and 17, and criterion 17.

- [x] A failure to commit a recovered or defaulted record at launch (`settings.commit()`, `restored()`) goes through the same unopenable error as a failed open, so the launch names the file; a Rust test makes the commit fail and sees the file named.
- [x] The English and Arabic sentences of the startup message are lower case throughout, as `rules/frontend` asks; the Rust test pinning the text checks it.
- [x] A batch whose COMMIT fails on a held connection issues a ROLLBACK before the connection goes back to the pool; a Rust test with an injected failing COMMIT sees the next request on that connection find no open transaction.

## Relevant areas

- `apps/desktop/tauri/src/{lib.rs,persisted.rs}`
- `apps/desktop/tauri/src/settings/mod.rs`
- `apps/desktop/tauri/src/database/{held.rs,proxy.rs}`

## Constraints

- Rust tests run with `--test-threads=1` and a `CARGO_TARGET_DIR` of the implementer's own outside the worktree path (Windows path limit).
- A changeset only where a user observes something no entry of this effort already says; otherwise say so in Notes ([[references/changesets]]).
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).

## Notes

- No changeset. `a-damaged-settings-file-no-longer-stops-the-app.md` already says a file the app is not allowed to open is named in a message; a file that cannot be written at launch is the same message to the person. The held connections and the startup message are this effort's own unreleased work, so the open transaction and the capitals never reached a user.
- `Persisted::restored()` already committed through `unopenable`; its test (`a_missing_record_that_cannot_be_written_back_is_named`) passed before the fix and now pins it. The gaps were `settings::open`'s commit and the sync record's reconcile commit at launch, both now through `Persisted::commit_at_launch`.
