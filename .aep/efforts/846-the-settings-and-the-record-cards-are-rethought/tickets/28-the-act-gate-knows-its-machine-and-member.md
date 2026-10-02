---
status: resolved
blocked-by: []
---

# fix(desktop): the act gate knows its machine and its member

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Review round one, correctness. Two holes in ticket 24's act gate, each open only until the next heartbeat: (1) the session an owner gets by connecting to an existing organization (`setup/connect.rs`, `signing_in` with an empty `machine_id`) carries no machine id, so `ended_alone` always answers false and that machine acts after being signed out alone; (2) `open_session` raises the session's sign-out number with the record's acknowledged mark even when the record names the previous member, so a member who signs in where another was signed out alone can act after their own machine is ended. Also, defensively, `remote::batch` refuses a statement carrying transaction control, as `remote::query` does.

## Acceptance Criteria

Traces requirement 10 and criterion 10 (and 15 for the batch).

- [x] A Rust test: an owner connected to an existing organization on B, B signed out alone from A, B pulls; B's next act is refused and walls before any heartbeat. *Verified: the run tree's `cargo test -- --test-threads=1` over 28 integrated includes `an_owner_connected_on_the_account_is_refused_its_next_act_once_signed_out_alone` (B refused with `SessionsEnded` and walled, A still acts); the builder saw it panic without the fix.*
- [x] A Rust test: member X signed out alone on M twice, X signs out, Y signs in on M; Y's other machine ends M; M's next act is refused before any heartbeat. The record's mark is used only when it names the signing-in member. *Verified: the same run includes `a_member_signed_in_where_another_was_signed_out_alone_is_refused_after_their_own` (Y's session opens at 0, not X's 2; M refused and walled after Y's machine ends it); it failed without the fix.*
- [x] A Rust test: a `workspace_batch` carrying `COMMIT` (or `BEGIN`, `ROLLBACK`) in a step is refused with nothing sent. *Verified: the same run includes `a_batch_with_a_step_that_opens_or_closes_a_transaction_is_refused_with_nothing_sent` (COMMIT, begin, ROLLBACK each `InvalidInput`, the request count unchanged).*
- [x] `cargo test` passes; `cargo fmt --check` clean. *Verified: the same run printed 672 passed, 0 failed, 11 ignored; `cargo fmt --check` clean.*

## Relevant areas

- `apps/desktop/tauri/src/organization/{setup/connect.rs,session/mod.rs,session/machine.rs,workspace/remote.rs}`

## Constraints

- No schema change.
