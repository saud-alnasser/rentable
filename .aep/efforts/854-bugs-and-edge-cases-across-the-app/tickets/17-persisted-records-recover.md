---
status: resolved
---

# fix(desktop): a damaged settings or sync file no longer stops the app

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part two, *17*).

## Outcome

Records are fsynced before the rename and keep a last good copy; a record whose content cannot be read is set aside and recovered from the copy or defaults; a record that cannot be opened is never overwritten and ends in a message naming it rather than a panic.

## Acceptance Criteria

Traces requirement 17 and criterion 17.

- [x] `Persisted::commit` fsyncs and writes `.bak` after the primary; `Persisted::recover` sets a bad file aside as `.corrupt-<ms>` and recovers.
- [x] The three plugin setups use `recover` and return I/O errors to a native message and exit instead of `.expect`.
- [x] Rust tests per criterion 17, including `remote-sync.json` recovering two held organizations from `.bak`, and a locked file left untouched.

## Relevant areas

- `apps/desktop/tauri/src/persisted.rs`
- `apps/desktop/tauri/src/{settings,sync,update}/{mod.rs,plugin.rs}`
- `apps/desktop/tauri/src/machine/record.rs`
- `apps/desktop/tauri/src/lib.rs`

## Constraints

- The app has users: nothing here may make a held organization disappear ([[rules/data]]).
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
