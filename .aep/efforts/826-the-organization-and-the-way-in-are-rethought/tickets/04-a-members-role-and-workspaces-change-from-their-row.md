---
status: resolved
blocked-by: ['01', '03']
---

# feat(organization): a member's role, permissions and workspaces change from their row

## Outcome

A holder of `changeRole` writes another member's role and permissions to their row, re-signed,
and the certificate follows: gaining a first signing act earns one from the owner, losing the
last retires it after re-signing; a holder of `grantWorkspace` gives and withdraws a
workspace; and the members list reads each member's workspaces with their access and whether
an invitation is pending, from one command.

## Acceptance Criteria

Traces requirement 6, requirement 7, requirement 5 and requirement 15 (the row's facts) of
[[efforts/826-the-organization-and-the-way-in-are-rethought/spec]], and its criterion 6,
criterion 7 and criterion 5 (the Rust half).

- [x] `organization/role.rs` exports `change_role(store, session, member_id, role,
      permissions, now)`: requires `ChangeRole`, refuses the caller's own row and the owner's,
      refuses for a caller who is not the owner any role or permission set carrying a signing
      act the target does not already hold, with one sentence naming the owner; writes the row
      re-signed with both fields; and reads it back as `MemberFacts`. Asserted in `role.rs`.
- [x] The `member` table carries `signing_public_key BLOB NOT NULL`, the verifying half of the
      key `derive_seed(ADMINISTRATOR_KEY_PURPOSE)` yields; `MemberRecord` carries it;
      `setup::create_organization` and `invite::issue` write it from the fresh secret; it is under
      `MemberAuthority` with the domain `member.v2`, the fixed vectors in `authority.rs` updated
      and the seven-tables test in `store.rs` pinning the column; `forget::OldShape` gains a
      variant for a `member` table without it, read after the invitation check, and the startup
      test in `forget.rs` asserts a replica lacking it is forgotten.
- [x] A target gaining its first signing act has `cert-<member id>` issued by the owner's
      organization key over the row's `signing_public_key` in the same call; a target losing its
      last has its rows re-signed under the actor and its certificate revoked through
      `re_sign_rows_of_certificate` and `Certificate::revoked`. A test widens a member with
      `inviteMember`, has them invite, and verifies the invited row on a second store; narrows
      them, and asserts a row they newly sign is refused with `revoked`.
- [x] `workspace::withdraw_grant(store, session, workspace_id, member_id)` requires
      `GrantWorkspace`, refuses the owner's own grant, deletes the grant and pushes; the
      member's credential is not rotated, asserted by every other row being byte-identical.
- [x] `MemberFacts` carries `workspaces: Vec<{ id, access }>` in place of `workspace_ids`, and
      `pending: Option<{ invitation_id, expires_at, standing, can_copy }>` where `can_copy` is
      whether the caller issued it; `organization_invitations` and `InvitationFacts` do not
      exist (`grep`).
- [x] `command.rs`, `host.ts`, `platform/tauri.ts` and `organization/router.ts` carry
      `member_change_role(member_id, role, permissions)` under `changeRole` and
      `workspace_grant_withdraw(workspace_id, member_id)` under `grantWorkspace`;
      `OrganizationMember` in `host.ts` matches; every consumer of `workspaceIds` and of the
      invitation list compiles (the members and invitations components read the new shape
      minimally; their redraw is ticket 10's).
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass.

## Relevant areas

`apps/desktop/tauri/src/organization/{role,invite,workspace,authority,store,command}.rs`;
`apps/desktop/src/lib/platform/{host,tauri}.ts`, `organization/{router,query}.ts`,
`organization/component/{members,invitations}.svelte`, `layout/component/sidebar.svelte`.

## Constraints

- **Read [[efforts/826-the-organization-and-the-way-in-are-rethought/plan]], *Certification
  stays the owner's*.**
- **`signer_of` in `workspace.rs` is not changed**; a widened member signs because a certificate
  names them, never because the role is read.
- **The `MemberAuthority` domain moves to `member.v2` and nothing else in `authority.rs` moves**:
  the certificate and invitation preimages are unchanged, and `signer_of` still matches the
  session's derived key.
- **[[rules/module-layout]]**: `role.rs` is one word for one concept; the certificate issue and
  revoke it performs call `authority.rs` and `store.rs`, never copy them.

## Notes

Stopped on 2026-09-13 at the return-to-plan trip-wire before anything was written: the row kept
no copy of the member's signing key, so the owner had nothing to certify on widening. The plan's
*Certification stays the owner's* is corrected in place; the row carries the key from here, and
this ticket writes it.

Built by a second implementer against the re-cut criteria and landed on 2026-09-14, after
tickets 06 and 09; the cherry-pick met ticket 09's settings area, and the resolution takes this
ticket's removal of the invitation list through the area (the `invitations` prop and the route's
query are gone, `invitations.svelte` reads the members' `pending`). Departures: `invite::members`
takes `now`, since `pending.standing` turns on the clock, and the command passes it;
`MemberFacts` loses `must_change_password` (the row's column and `MemberSession`'s flag stay,
nearly dead); `MemberFacts.workspaces` reuses `WorkspaceGrant`; `change_role` also refuses an
unknown role and a non-owner naming somebody `administrator`; `withdraw_grant` refuses a grant
nobody holds; `invitations.svelte` takes `members` alone; no changeset, since nothing
user-visible ships until ticket 10 draws the actions.

Raised, not taken: withdrawing the organization database's own grant is not refused (no
interface offers it); `useChangeRole` and `useWithdrawGrant` hooks belong with ticket 10's
dialogs; a widened member's open session keeps its old permissions until the next sign-in.
