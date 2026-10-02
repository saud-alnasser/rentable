---
status: open
blocked-by: []
---

# fix(desktop): a sign-in reads the sign-out count it has just pulled

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Review round two, correctness, two low findings the human chose to fix on 2026-10-02 ("Fix both now"). (1) A password sign-in at the wall (`session/command.rs` calling `join::admit` before `store.pull()`) reads this machine's `machine_sign_out` count from the replica as it last pulled, so a machine signed out alone and then signed in again by its password opens under a stale mark and is walled once more on its first act; the sign-in acknowledges the count as Turso holds it. (2) A record written before effort 828 with no `machine_id` resumes into a session with an empty id; `machine_registered` draws the id into the record but never into the session, so the act gate stays silent until the heartbeat; the session takes the id the record is given.

## Acceptance Criteria

Traces requirement 10 and criterion 10.

- [ ] A Rust test: X signs out on M by hand, X signs M out alone from A, X signs in on M with the password; X's first act on M runs and M stays signed in across the next heartbeat. It fails without the fix.
- [ ] A Rust test: a record with an empty `machine_id` resumes, the machine is drawn its id, then it is signed out alone from another machine; its next act is refused and walls before any heartbeat. It fails without the fix.
- [ ] `cargo test` passes; `cargo fmt --check` clean.

## Relevant areas

- `apps/desktop/tauri/src/organization/session/{command.rs,mod.rs,replica.rs,remember.rs}`, `apps/desktop/tauri/src/organization/invitation/join.rs`

## Constraints

- No schema change. Keep the order the context states (pull, then check) wherever it already holds.
