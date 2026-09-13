---
status: open
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

- [ ] `organization/role.rs` exports `change_role(store, session, member_id, role,
      permissions, now)`: requires `ChangeRole`, refuses the caller's own row and the owner's,
      refuses for a caller who is not the owner any role or permission set carrying a signing
      act the target does not already hold, with one sentence naming the owner; writes the row
      re-signed with both fields; and reads it back as `MemberFacts`. Asserted in `role.rs`.
- [ ] A target gaining its first signing act has `cert-<member id>` issued by the owner's
      organization key in the same call; a target losing its last has its rows re-signed under
      the actor and its certificate revoked through `re_sign_rows_of_certificate` and
      `Certificate::revoked`. A test widens a member with `inviteMember`, has them invite, and
      verifies the invited row on a second store; narrows them, and asserts a row they newly
      sign is refused with `revoked`.
- [ ] `workspace::withdraw_grant(store, session, workspace_id, member_id)` requires
      `GrantWorkspace`, refuses the owner's own grant, deletes the grant and pushes; the
      member's credential is not rotated, asserted by every other row being byte-identical.
- [ ] `MemberFacts` carries `workspaces: Vec<{ id, access }>` in place of `workspace_ids`, and
      `pending: Option<{ invitation_id, expires_at, standing, can_copy }>` where `can_copy` is
      whether the caller issued it; `organization_invitations` and `InvitationFacts` do not
      exist (`grep`).
- [ ] `command.rs`, `host.ts`, `platform/tauri.ts` and `organization/router.ts` carry
      `member_change_role(member_id, role, permissions)` under `changeRole` and
      `workspace_grant_withdraw(workspace_id, member_id)` under `grantWorkspace`;
      `OrganizationMember` in `host.ts` matches; every consumer of `workspaceIds` and of the
      invitation list compiles (the members and invitations components read the new shape
      minimally; their redraw is ticket 10's).
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass.

## Relevant areas

`apps/desktop/tauri/src/organization/{role,invite,workspace,authority,store,command}.rs`;
`apps/desktop/src/lib/platform/{host,tauri}.ts`, `organization/{router,query}.ts`,
`organization/component/{members,invitations}.svelte`, `layout/component/sidebar.svelte`.

## Constraints

- **Read [[efforts/826-the-organization-and-the-way-in-are-rethought/plan]], *Certification
  stays the owner's*.**
- **`signer_of` in `workspace.rs` is not changed**; a widened member signs because a certificate
  names them, never because the role is read.
- **The `MemberAuthority` preimage is unchanged**: role and permissions were already under it.
- **[[rules/module-layout]]**: `role.rs` is one word for one concept; the certificate issue and
  revoke it performs call `authority.rs` and `store.rs`, never copy them.

## Notes

Nothing yet.
