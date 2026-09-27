---
status: open
blocked-by: [28]
---

# fix(organization): the format runner heals as before and finds the owner in any format

## Outcome

Review round one of tickets 26 to 28, the runner. Two things the split promised do not hold yet.
A `format` row set below 2 on an upgraded organization, with nothing of format 1 left, is now
refused as a transform the owner already made, and the owner and every member are locked out;
before the split the owner's next sign-in wrote the row back. And the runner still finds the
owner's vault and grant through format 1's readers alone, so a format 3 would mean editing
`upgrade.rs` too, which requirement 14 says it does not. After this, a directory with nothing of
format 1 left reads as at least format 2 and is given its row as before; each entry in
`TRANSITIONS` supplies the readers that find the vault and the grant in the format it starts
from, and the runner calls the first due entry's; and the whole sign-in path, not only `walked`,
runs a test-only next format end to end.

## Acceptance Criteria

Traces requirement 14, and requirement 11, of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [ ] Where nothing of format 1 is left, a `format` row of 1, 0 or below reads as 2, so no format
      1 change is due and only the row is written. A test sets the row to 1 on an upgraded
      organization, with the owner's machine holding `known_format` and without it, and the
      owner's next sign-in writes 2 and signs in.
- [ ] Each entry of `TRANSITIONS` carries the readers that find the owner's vault and their own
      grant in the format it starts from; `upgrade.rs` imports nothing of `transition/two.rs`.
- [ ] The runner is given its list end to end (the shipped format is the list's length plus one),
      and a test runs the owner's sign-in and a member's through `with_password` over a list
      with a test-only next entry: the owner's walks the organization to the next format with the
      copy and the `format` row, and the member's waits and then follows.
- [ ] The tests of `carried_by`, `planned` and `applied` sit at the foot of `transition/two.rs`
      (`rules/testing`), and the module comment of `transition/mod.rs` names every move a next
      format takes, its lines wrapped at 100.
- [ ] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/organization/upgrade.rs`, `transition/mod.rs`, `transition/two.rs`, `store.rs`
  (`format_as_it_stands`, `is_older`)
