---
status: open
blocked-by: []
---

# fix(desktop): the act gate knows its machine and its member

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Review round one, correctness. Two holes in ticket 24's act gate, each open only until the next heartbeat: (1) the session an owner gets by connecting to an existing organization (`setup/connect.rs`, `signing_in` with an empty `machine_id`) carries no machine id, so `ended_alone` always answers false and that machine acts after being signed out alone; (2) `open_session` raises the session's sign-out number with the record's acknowledged mark even when the record names the previous member, so a member who signs in where another was signed out alone can act after their own machine is ended. Also, defensively, `remote::batch` refuses a statement carrying transaction control, as `remote::query` does.

## Acceptance Criteria

Traces requirement 10 and criterion 10 (and 15 for the batch).

- [ ] A Rust test: an owner connected to an existing organization on B, B signed out alone from A, B pulls; B's next act is refused and walls before any heartbeat.
- [ ] A Rust test: member X signed out alone on M twice, X signs out, Y signs in on M; Y's other machine ends M; M's next act is refused before any heartbeat. The record's mark is used only when it names the signing-in member.
- [ ] A Rust test: a `workspace_batch` carrying `COMMIT` (or `BEGIN`, `ROLLBACK`) in a step is refused with nothing sent.
- [ ] `cargo test` passes; `cargo fmt --check` clean.

## Relevant areas

- `apps/desktop/tauri/src/organization/{setup/connect.rs,session/mod.rs,session/machine.rs,workspace/remote.rs}`

## Constraints

- No schema change.
