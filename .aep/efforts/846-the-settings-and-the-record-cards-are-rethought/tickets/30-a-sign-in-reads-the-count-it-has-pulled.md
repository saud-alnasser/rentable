---
status: resolved
blocked-by: []
---

# fix(desktop): a sign-in reads the sign-out count it has just pulled

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Review round two, correctness, two low findings the human chose to fix on 2026-10-02 ("Fix both now"). (1) A password sign-in at the wall (`session/command.rs` calling `join::admit` before `store.pull()`) reads this machine's `machine_sign_out` count from the replica as it last pulled, so a machine signed out alone and then signed in again by its password opens under a stale mark and is walled once more on its first act; the sign-in acknowledges the count as Turso holds it. (2) A record written before effort 828 with no `machine_id` resumes into a session with an empty id; `machine_registered` draws the id into the record but never into the session, so the act gate stays silent until the heartbeat; the session takes the id the record is given.

## Acceptance Criteria

Traces requirement 10 and criterion 10.

- [x] A Rust test: X signs out on M by hand, X signs M out alone from A, X signs in on M with the password; X's first act on M runs and M stays signed in across the next heartbeat. It fails without the fix. *Verified: the run tree's `cargo test -- --test-threads=1` over 30 integrated includes `a_sign_in_acknowledges_a_sign_out_alone_its_own_pull_brought` (the session opens under the pulled count; with the read before the pull the builder saw it fail, "the session opened under 0"); `admit` discards a failed pull, so an offline sign-in still opens.*
- [x] A Rust test: a record with an empty `machine_id` resumes, the machine is drawn its id, then it is signed out alone from another machine; its next act is refused and walls before any heartbeat. It fails without the fix. *Verified: the same run includes `a_session_resumed_before_its_machine_had_an_id_is_refused_once_signed_out_alone` (failing without the replica.rs change, "M acted after it was signed out on its own").*
- [x] `cargo test` passes; `cargo fmt --check` clean. *Verified: the same run printed 674 passed, 0 failed, 11 ignored; `cargo fmt --check` clean.*

## Relevant areas

- `apps/desktop/tauri/src/organization/session/{command.rs,mod.rs,replica.rs,remember.rs}`, `apps/desktop/tauri/src/organization/invitation/join.rs`

## Constraints

- No schema change. Keep the order the context states (pull, then check) wherever it already holds.
