---
status: resolved
---

# feat(desktop): a machine is named, listed, and signed out on its own

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The Rust half of the plan's *Signing out one machine*: the `machine_sign_out` and `machine_name` tables, the acknowledged mark in the local record, the check beside the epoch at resume and on the heartbeat, `end_machine`, row clearing in `end_elsewhere`, the machine's sealed name, `seen_at` refreshed hourly on the heartbeat, the list with no presence window, and the `session_machines` and `session_end_machine` commands gated `Own`.

## Acceptance Criteria

Traces requirements 9, 10 and 11, and criteria 9, 10 and 11 at the store and session layers.

- [x] Two `OrganizationStore`s over one replica, each with its own `machine_id`: both machines are listed, this one first and flagged; another member's are absent; one seen 30 days ago is present; a nameless row lists `name: None`. *Verified: the full suite over 08 integrated on 11 (`cargo test -- --test-threads=1` in the run tree) printed 668 passed, 0 failed, 11 ignored; it includes `session::machine::tests::every_machine_signed_in_as_the_reader_is_listed_this_one_first`.*
- [x] A ends B; one heartbeat on B reaches `sign_out` with `signed_out_elsewhere`, and B's keyring entry is gone; A and a third machine are untouched; `session_epoch` and the vault are unmoved. *Verified: the full suite over 08 integrated on 11 (`cargo test -- --test-threads=1` in the run tree) printed 668 passed, 0 failed, 11 ignored; `heartbeat::tests::a_machine_signed_out_on_its_own_is_gone_after_one_heartbeat_and_back_with_its_password` checks the wall, the keyring, A and C untouched, epoch and vault unmoved.*
- [x] B signed in again with the same password stays signed in across the next heartbeat. *Verified: the same heartbeat test signs B in again through `join::admit` with the same password and finds it still in after the next beat.*
- [x] B closed when it was ended is refused at `resume` before its key is spent. *Verified: `a_machine_closed_when_it_was_ended_is_refused_at_resume_before_its_key_is_spent` (in the 668) files a key that opens nothing, so a check after spending would fail differently.*
- [x] Ending one's own machine is refused; `sent` is false against a server that answers nothing. *Verified: `this_machine_an_old_one_and_somebody_elses_are_not_ended_alone` and `ending_a_machine_offline_says_it_was_not_sent` (in the 668).*
- [x] `end_elsewhere` clears the reader from every other machine's row. *Verified: `ending_every_other_session_clears_the_reader_from_every_other_machine` (in the 668); `end_elsewhere` now takes the machine id.*
- [x] A machine with no name row is listed with `mayEndAlone: false`, and `end_machine` refuses it. *Verified: the listing test lists a nameless row with `mayEndAlone: false`, and the not-ended-alone test refuses it (with `DatabaseRefused` for now; ticket 09 gives it its own reason).*
- [x] The stored name does not contain the plaintext; an unchanged name is not rewritten; `machine/name.rs` trims and caps at 64. *Verified: `the_name_is_sealed_written_once_and_capped` and the three `machine::name::tests` (in the 668).*
- [x] `TABLES` holds 17; `complete_schema` creates both tables on a format-three replica lacking them; the format-two walk test passes its shape check; the `machine` column pin stays at four. *Verified: `store::tests::a_format_three_replica_without_the_machine_tables_gains_both` asserts 17 tables and the four-column `machine` pin; the format-two walk test passes.*
- [x] `cargo test` passes. *Verified: the full suite over 08 integrated on 11 (`cargo test -- --test-threads=1` in the run tree) printed 668 passed, 0 failed, 11 ignored; `cargo fmt --check` clean.*

## Relevant areas

- `apps/desktop/tauri/src/organization/store/{mod,session}.rs`
- `apps/desktop/tauri/src/organization/session/{epoch,heartbeat,remember,command,mod}.rs`, `replica.rs`
- `apps/desktop/tauri/src/machine/{record,name}.rs`, `apps/desktop/tauri/src/organization/{mod,plugin}.rs`, `build.rs`

## Constraints

- [[rules/credentials]] binds: no token or session secret crosses; the commands hand over names and times.
- Confirm `whoami`'s 2.x `devicename` signature in its docs before relying on it ([[protocol]]).
- Correct [[contexts/desktop/organization]]'s table count in the same commit.
- No changeset: nothing a person sees changes until ticket 09.
