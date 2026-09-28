---
status: resolved
blocked-by: [22]
---

# fix(organization): the upgrade happens once, online, and every machine follows it

## Outcome

Review of ticket 22, correctness. The upgrade as built could strand the organization in four ways:

- a member machine that updated before the owner stayed format 1 and was refused forever, because
  nothing pulled before the refusal;
- an owner upgrading offline, or after a failed push of changes the old build captured, committed
  a local upgrade whose push then failed forever (the measured `Number of arguments mismatch`);
- two owner machines could each upgrade;
- a remote left with only part of the upgrade matched neither format and refused everyone.

After this:
- the upgrade runs only against the organization's latest state;
- it resumes a partial one;
- every machine that meets a format 1 replica pulls before it answers;
- a row an old build signs after the upgrade never breaks a directory read for everyone.

The plan's *Migration* section gets the order as built, the measurement's result and the online
condition, as italic notes.

## Acceptance Criteria

Traces requirement 11 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] The owner's upgrade runs only after the changes already captured on the machine have been
      pushed, or there were none, and a pull has completed. Offline, or with either step failing,
      nothing is transformed and the owner is refused with a reason that asks for a connection, in
      English and Arabic. A test drives each case with nothing written.
- [x] A member machine holding a format 1 replica pulls before it answers, using the member's own
      format 1 credential verified under the format 1 rules. Once the remote reads as format 2, the
      member's sign-in and resume go through. While the remote is still format 1, they get the
      waits-for-its-owner refusal. A test covers both.
- [x] A remote left with part of the upgrade is recognised as unfinished, not as format 2 or as a
      stranger. The owner's next sign-in (from the same machine or another) completes it, and every
      other machine is told it waits for its owner. A test builds each partial state the upgrade's
      order can leave.
- [x] Two owner machines cannot both transform: the second finds the upgrade done, or unfinished and
      completes it, and never replays the first's schema change. A test runs one after the other on
      one database.
- [x] A workspace, grant, invitation or mark row an old build signs after the upgrade never makes the
      directory unreadable for everyone. It is either verified or left out of what is read. A test
      writes one.
- [x] The owner is recognised by the organization key alone:
      - an unsigned `revoked_at` on the owner's format 1 certificate is ignored;
      - `must_change_password` on the owner's row neither hides their vault nor stops the upgrade;
      - a pin that a format 1 handover left stale is settled before the owner test runs.
      Each case has a test.
- [x] A non-key-holder's row saying `owner` maps from its own `permissions` column, as the old
      session read it, and the doc comment says so.
- [x] The join and machine-link refusals are tested against a format 1 organization in the
      main-branch shape, not a format 2 one with `format` dropped.
- [x] `plan.md`, *Migration*, records in italic notes:
      - the order as built, including the push before the pull;
      - the measured result in place of the conditional;
      - the online condition.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `tauri/src/organization/upgrade.rs`, `store.rs` (`is_format_one`, `reshape_format_one`,
  `refuse_another_format`, the `verified` reads), `command.rs` (`open_replica`, sign-in, resume),
  `setup.rs` (`connect_existing`), `join.rs`, `machine.rs`, `connect.rs`, `forget.rs`, `error.rs`
- `src/lib/i18n` (en and ar)
