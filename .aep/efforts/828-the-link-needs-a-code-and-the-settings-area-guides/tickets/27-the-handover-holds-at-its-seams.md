---
status: open
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

- [ ] `command::succession_followed` (and the resume's follow) re-reads the session's own row
      after pinning the new key, so `session.role` and `session.permissions` are the row's and
      the founder's session is an administrator's; every place that signs with
      `owner_key_from(&session.secret)` for a certificate (`invite.rs`, `role.rs`) signs only
      where the session's row is the owner's under the pinned key, refusing otherwise by name.
      Tests: after an acceptance elsewhere and a state read, the founder's session is refused
      `organization_delete` and a `member_create` of an administrator, and a certificate it did
      issue before the read is refused rather than written; the directory still verifies on
      every machine.
- [ ] `role::accept_ownership` refuses an accepting row that is removed, or whose session epoch
      no longer admits the session (signed out everywhere), by name; `retire_member` deletes the
      member's standing succession row and clears their seal. Tests: offer to Ada, remove Ada,
      Ada's acceptance is refused and the founder stays owner; the same after sign-out-everywhere.
- [ ] The launch's resume and the heartbeat follow the succession after the pull, not before:
      a machine closed across the handover launches, pulls, follows, and resumes its session
      under the new key with no sign-out; a machine open across it follows on the heartbeat that
      pulls the re-keyed rows. Tests for both launch paths.
- [ ] `role::withdraw_offer` refuses by name where the succession row it finds after its pull is
      completed; a test pins it.
- [ ] `members.svelte`'s link act is offered to a holder of `inviteMember` or `resetPassword`,
      the area computing the gate from both; `members.svelte.test.ts` pins `canReset` alone
      offering the link.
- [ ] `sync-status.ts` answers a standing for a machine that never reached Turso ("not yet
      reached turso" or the plainer sentence in both locales) rather than up to date, and the
      standing block and its tests follow.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; `cargo fmt --check` prints
      nothing; no changeset line, since nothing here is a new capability.

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
