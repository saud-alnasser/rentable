---
status: open
---

# feat(desktop): a machine is named, listed, and signed out on its own

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The Rust half of the plan's *Signing out one machine*: the `machine_sign_out` and `machine_name` tables, the acknowledged mark in the local record, the check beside the epoch at resume and on the heartbeat, `end_machine`, row clearing in `end_elsewhere`, the machine's sealed name, `seen_at` refreshed hourly on the heartbeat, the list with no presence window, and the `session_machines` and `session_end_machine` commands gated `Own`.

## Acceptance Criteria

Traces requirements 9, 10 and 11, and criteria 9, 10 and 11 at the store and session layers.

- [ ] Two `OrganizationStore`s over one replica, each with its own `machine_id`: both machines are listed, this one first and flagged; another member's are absent; one seen 30 days ago is present; a nameless row lists `name: None`.
- [ ] A ends B; one heartbeat on B reaches `sign_out` with `signed_out_elsewhere`, and B's keyring entry is gone; A and a third machine are untouched; `session_epoch` and the vault are unmoved.
- [ ] B signed in again with the same password stays signed in across the next heartbeat.
- [ ] B closed when it was ended is refused at `resume` before its key is spent.
- [ ] Ending one's own machine is refused; `sent` is false against a server that answers nothing.
- [ ] `end_elsewhere` clears the reader from every other machine's row.
- [ ] A machine with no name row is listed with `mayEndAlone: false`, and `end_machine` refuses it.
- [ ] The stored name does not contain the plaintext; an unchanged name is not rewritten; `machine/name.rs` trims and caps at 64.
- [ ] `TABLES` holds 17; `complete_schema` creates both tables on a format-three replica lacking them; the format-two walk test passes its shape check; the `machine` column pin stays at four.
- [ ] `cargo test` passes.

## Relevant areas

- `apps/desktop/tauri/src/organization/store/{mod,session}.rs`
- `apps/desktop/tauri/src/organization/session/{epoch,heartbeat,remember,command,mod}.rs`, `replica.rs`
- `apps/desktop/tauri/src/machine/{record,name}.rs`, `apps/desktop/tauri/src/organization/{mod,plugin}.rs`, `build.rs`

## Constraints

- [[rules/credentials]] binds: no token or session secret crosses; the commands hand over names and times.
- Confirm `whoami`'s 2.x `devicename` signature in its docs before relying on it ([[policies/engineering]]).
- Correct [[contexts/desktop/organization]]'s table count in the same commit.
- No changeset: nothing a person sees changes until ticket 09.
