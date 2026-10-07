---
status: open
---

# fix(organization): a verdict is judged with its pull and never guesses

Authoritative: [[efforts/857-updating-never-locks-a-member-out/spec]], and [[efforts/857-updating-never-locks-a-member-out/plan]].

## Outcome

Found at review round one (correctness 3, 4, 5, 6, 12, 15): a version verdict that cannot be read neither lets writes through nor freezes the organization on a transient error, the pull and its verdict happen under one hold so no write lands between them, acts never overlap a write hold, a read-only organization does not break opening a workspace, and the wall's hold belongs to the organization it is about.

## Acceptance Criteria

Traces requirement 6, requirement 7, requirement 9, criterion 6 and criterion 9.

- [ ] A workspace verdict whose floors cannot be read is not `Writable`: the heartbeat does not push and the reason is surfaced; a test with an unreadable `data_floor`.
- [ ] A transient error reading the organization's verdict keeps the last verdict rather than turning the organization read-only; a test with a failing read after a good one.
- [ ] The heartbeat's organization pull and the verdict that follows it run under one hold of the store, so no act commits between them; a test interleaves an act.
- [ ] Acts that hold writes for the organization are serialised, so `release_writes` never lifts the hold another act relies on; a test runs two overlapping acts below the write floor and finds neither writes.
- [ ] Opening a workspace that is behind in an organization that is read-only by version neither writes a lease into the organization nor fails after migrating: it is refused before any write with the read-only reason, or opens without recording; a test.
- [ ] The version hold shown at the wall carries the organization it is about, and removing or leaving that organization clears it; a test.

## Relevant areas

- apps/desktop/tauri/src/organization/session/version.rs, command.rs (heartbeat), organization/store/format.rs, organization/act.rs
- apps/desktop/tauri/src/organization/workspace/command.rs, lease/mod.rs

## Constraints

- Each defect is pinned first by a test that fails on the code as it stands, at the level [[rules/testing]] fixes ([[skills/tdd]]); where a finding turns out not to reproduce, say so in Notes with the evidence and leave its box unticked for the orchestrator.
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless nothing here is observable by a user; say so in Notes if none.
