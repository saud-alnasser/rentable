---
status: open
---

# docs(aep): the live remote rule admits this effort's tests by name

## Outcome

`[[rules/testing]]`, under *Tests that reach a live remote*, names the tests this effort adds
and the property each one is there for, before any of them is written. The section's own
instruction is that a fourth live test is a decision taken in that section rather than a file
that quietly appears, and this effort adds four at once.

## Acceptance Criteria

Traces criterion 6, criterion 11 and criterion 14 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], each of which reaches a live
Turso account and none of which can be written until this lands.

- [ ] *Tests that reach a live remote* names each admission separately, with the property it
      measures and why a local file, a loopback server, or an in-memory engine cannot answer it.
      The four are: provisioning a group and a database from Rust (ticket 05); a `read-only`
      grant's write being refused **by Turso** rather than by the application (criterion 11); the
      two removal paths and what each costs the remaining members (criterion 14); and a second
      machine reading what the first wrote (criterion 6).
- [ ] The count in the heading sentence is corrected rather than left stale. It reads "three"
      today and the section says in as many words that the count is the thing that goes stale.
- [ ] Where two of these measure the same property, they are admitted as one property with two
      instances rather than as two admissions. The section already distinguishes a third property
      from a third instance, and repeating that distinction is the point of writing it down.
- [ ] The opt-in flag is stated for the Rust ones. `RENTABLE_LIVE_TURSO=1` arms both TypeScript
      files today and the section warns that setting it for a whole run provisions databases
      nobody asked for; whether the Rust tests join that flag or take their own is decided here
      and written down, not discovered by whoever runs the suite next.
- [ ] `node .aep/scripts/validate.mjs` passes and `.aep/index.md` is regenerated rather than
      edited.

## Relevant areas

`.aep/rules/testing.md`, the section *Tests that reach a live remote*, lines 248 to 288 as of
this writing. The three existing admissions are the four `losing_writer` tests at the foot of
`apps/desktop/tauri/src/database/mod.rs`, `control-plane/src/workspace/tests/provisioning.test.ts`,
and `control-plane/src/database/tests/hosted.test.ts`.

The last of those three is the closest model: it arrived with #757 and its entry argues why it is
a new property rather than another instance of an existing one. Read it before writing these.

## Constraints

- **This ticket writes no test.** It is the decision that licenses four, and it is separated from
  them so the decision is reviewable on its own rather than buried under the code it permits.
- **`[[references/turso]]` still governs what a live test may do.** It forbids deleting a database
  the run did not just create, forbids touching `control-plane` and `control-plane-live-test`, and
  forbids a live create or mint against the human's account without being asked. Admitting a test
  here does not grant any of that; each live test still asks.

## Notes

Two of the three existing admissions belong to `apps/control-plane/`, which ticket 19 retires. The
section will need revisiting then, and that is ticket 19's rather than this one's: removing an
admission for a test that no longer exists is a different act from adding one for a test that does
not exist yet.
