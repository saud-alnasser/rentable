---
status: open
blocked-by: []
---

# fix(desktop): a machine signed out on its own cannot act before its next heartbeat

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Converge round one, gap B. `acting_row` checks the epoch alone, so a machine ended by `end_machine` can still take organization acts after a pull until its next heartbeat. The act path refuses once this machine's own sign-out count is past its acknowledged mark, as the heartbeat and resume already do, and sends it to the wall.

## Acceptance Criteria

Traces requirement 10 and criterion 10.

- [ ] A Rust test: B ended by A, B pulls, then an organization act on B is refused as signed out elsewhere before any heartbeat, and B reaches the wall; an act on A and on a third machine still runs.
- [ ] `cargo test` passes.

## Relevant areas

- `apps/desktop/tauri/src/organization/session/`

## Constraints

- No schema change.
