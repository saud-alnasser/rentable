---
status: resolved
---

# fix(organization): the handover holds at its seams

## Outcome

After a handover the founder's open session is an administrator's, on every gate and in what it
signs; a removed or signed-out-everywhere account cannot accept an offer; a machine closed or
open across the handover follows the succession at its next launch or heartbeat and keeps its
session; a withdrawal that finds the offer accepted is refused; the link act on a member's card
follows `resetPassword` as the router does; and a machine that never reached Turso does not
say it is up to date.

## Acceptance Criteria

Traces requirements 20, 22 and 25 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 20,
22, 25 and 12. Cut by review round two (its correctness findings 1 to 5 and question 7,
resolved by the human).

- [x] `command::succession_followed` (and the resume's follow) re-reads the session's own row
      after pinning the new key, so `session.role` and `session.permissions` are the row's and
      the founder's session is an administrator's; every place that signs with
      `owner_key_from(&session.secret)` for a certificate (`invite.rs`, `role.rs`) signs only
      where the session's row is the owner's under the pinned key, refusing otherwise by name.
      Tests: after an acceptance elsewhere and a state read, the founder's session is refused
      `organization_delete` and a `member_create` of an administrator, and a certificate it did
      issue before the read is refused rather than written; the directory still verifies on
      every machine.
      *Verified 2026-09-17 on the effort branch: `session::repin` re-reads the session's row
      after `follow_succession`, `command::followed` calling both from the state read and the
      heartbeat; `role::organization_key_of` derives and refuses with `NOT_THE_KEY_IN_FORCE`
      where the derived key is not the pinned one, and `write_account` and `change_role` sign
      through it; `the_founders_open_session_is_an_administrators_after_a_handover_elsewhere`
      and `a_session_whose_vault_does_not_derive_the_pinned_key_certifies_nobody` ok in `cargo
      test -- --test-threads=1` (`409 passed; 0 failed; 10 ignored`).*
- [x] `role::accept_ownership` refuses an accepting row that is removed, or whose session epoch
      no longer admits the session (signed out everywhere), by name; `retire_member` deletes the
      member's standing succession row and clears their seal. Tests: offer to Ada, remove Ada,
      Ada's acceptance is refused and the founder stays owner; the same after sign-out-everywhere.
      *Verified: `accept_ownership` reads its row through `session::acting_row`, refusing a
      removed row and one whose epoch no longer admits; `retire_member` deletes the standing
      succession and clears the seal;
      `a_removed_or_signed_out_everywhere_account_cannot_accept_the_offer` ok.*
- [x] The launch's resume and the heartbeat follow the succession after the pull, not before:
      a machine closed across the handover launches, pulls, follows, and resumes its session
      under the new key with no sign-out; a machine open across it follows on the heartbeat that
      pulls the re-keyed rows. Tests for both launch paths.
      *Verified: the pull and its check moved out of `session::resumed`; the resume stores the
      session then runs `command::ended_elsewhere`, which follows the succession and re-pins
      where the check refuses after the pull;
      `a_machine_closed_across_a_handover_launches_signed_in_under_the_new_key` and
      `a_machine_open_across_a_handover_follows_it_on_the_heartbeat` ok. The tests' two stores
      share one file with no remote, so the launch test cannot stage a stale replica; the
      heartbeat test discriminates and the launch runs that routine.*
- [x] `role::withdraw_offer` refuses by name where the succession row it finds after its pull is
      completed; a test pins it.
      *Verified: `withdraw_offer` refuses with `THE_OFFER_WAS_ACCEPTED` where the succession
      it finds after the pull is completed under the session's key;
      `a_withdrawal_that_finds_the_offer_accepted_is_refused_by_name` ok.*
- [x] `members.svelte`'s link act is offered to a holder of `inviteMember` or `resetPassword`,
      the area computing the gate from both; `members.svelte.test.ts` pins `canReset` alone
      offering the link.
      *Verified: `members.svelte` gates the link act on `canLink = canInvite || canReset`;
      `members.svelte.test.ts` with `canReset` alone offers `link`, `unset-password`,
      `end-sessions`.*
- [x] `sync-status.ts` answers a standing for a machine that never reached Turso ("not yet
      reached turso" or the plainer sentence in both locales) rather than up to date, and the
      standing block and its tests follow.
      *Verified: `SyncStatus` gains `neverReached` after the three refusals, drawn as `this
      machine has not reached turso yet` in both locales; `sync-status.test.ts`,
      `standing.svelte.test.ts` and `area.svelte.test.ts` follow (72 passed across the three
      component files).*
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; `cargo fmt --check` prints
      nothing; no changeset line, since nothing here is a new capability.
      *Verified in the run's worktree: `pnpm check` exit 0 (desktop `9313 FILES 0 ERRORS 0
      WARNINGS`), `pnpm lint` exit 0, `pnpm test` exit 0 (desktop `241 passed`); `cargo test`:
      `409 passed`; `cargo fmt --check` prints nothing; no changeset line.*

## Relevant areas

`apps/desktop/tauri/src/organization/{command,role,removal,session,invite,setup}.rs`,
`apps/desktop/src/lib/organization/component/members.svelte`,
`apps/desktop/src/lib/settings/component/area.svelte`, `apps/desktop/src/lib/workspace/sync-status.ts`,
`apps/desktop/src/lib/organization/component/standing.svelte`, the tests beside each,
`apps/desktop/src/lib/i18n/{en,ar}/index.ts`.

## Constraints

- **Each fix is the smallest that closes its finding**; the handover's design stands (plan,
  *Ownership is handed over in two acts*).
- **Rows administrators signed are not re-signed**; a certificate is issued under the pinned
  key or not at all.
- **Nothing under a signature changes** beyond what the acceptance already rewrites.

## Notes

- *2026-09-17, at integration.* Raised, not taken: on a replica that is truly offline a stale
  founder session can still act under the old key until the next heartbeat or state read
  reaches Turso; that is the offline-first limit, and every write it makes is refused by every
  other machine that verifies under the new key. Recorded in the spec's Risks at the close.
