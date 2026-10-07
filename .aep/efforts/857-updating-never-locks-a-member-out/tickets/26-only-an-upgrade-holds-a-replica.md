---
status: resolved
---

# fix(sync): only an upgrade's refusal holds a replica

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at review round one (correctness 2 and 11): a replica is held only for a refusal an upgrade caused, never for a replay conflict such as a unique constraint, and a hold that cannot be recorded stops the push rather than letting it drop the changes.

## Acceptance Criteria

Traces requirement 10 and criterion 10.

- [x] The unsendable classification for the workspace and the organization no longer matches the generic `failed to replay local change` wrapper alone; it holds only when the wrapped cause names something an upgrade removed or renamed (a missing table or column, an argument-count mismatch), and a unique or other constraint conflict is reported as the sync error it is, with no hold and no offer to discard; tests cover each.
- [x] Where the hold marker cannot be written, the push and pull of that replica are refused for the session (in memory) and the failure is surfaced, so no later push can answer Ok and drop the refused changes; a test simulates the write failing.
- [x] The live tests of tickets 13 and 20 still pass their classification against the measured strings, kept as fixtures.

## Relevant areas

- apps/desktop/tauri/src/database/unsendable.rs, database/mod.rs
- apps/desktop/tauri/src/organization/store/ (the organization hold of ticket 20)

## Constraints

- Each defect is pinned first by a test that fails on the code as it stands, at the level [[rules/testing]] fixes ([[skills/tdd]]); where a finding turns out not to reproduce, say so in Notes with the evidence and leave its box unticked for the orchestrator.
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.

## Notes

- No changeset: the hold this narrows has not shipped, so no user sees a change; the existing unreleased changesets describe the behaviour as it now is (review round two, standards 2).
