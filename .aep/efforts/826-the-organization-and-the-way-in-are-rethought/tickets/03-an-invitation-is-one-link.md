---
status: open
blocked-by: ['01']
---

# feat(organization): an invitation is one link

## Outcome

Inviting produces one `rentable://` link carrying the organization and an invitation half, and
opening it opens the member's vault with the secret inside it, reseals the vault under the
password the person chooses, consumes the invitation, and signs them in; a reset is the same
link freshly issued with the member's permissions kept; the issuer can copy a link again,
anybody else with the act issues a new one, and revoking a person who never accepted removes
them. No generated password crosses on its own.

## Acceptance Criteria

Traces requirement 8, requirement 9 and requirement 15 (copy, new link, revoke) of
[[efforts/826-the-organization-and-the-way-in-are-rethought/spec]], and its criterion 8 (the
Rust half) and criterion 9 (the Rust half).

- [ ] `JoinLink` carries `invitation: Option<InvitationHalf { id, secret }>`, encoded only when
      present; `link.rs`'s field test pins five keys on an organization link and six on an
      invitation link, and asserts neither text contains `"password"`.
- [ ] `invite_member(store, session, link, invitation, kdf, now)` takes workspaces as `(id,
      access)` pairs, refuses `read-only` for a caller who is not the owner, and answers
      `Invited { member_id, invitation_id, username, join_link, expires_at,
      unreachable_workspaces }` with `join_link` the invitation link and no password field;
      `issue` takes the permissions to write, and `reissue_invitation` passes the row's own.
- [ ] `join::accept(store, machine, held, link, password, credential, now)` finds the invitation
      by the link's id, refuses a lapsed, consumed or revoked one with a sentence naming which,
      refuses a link whose organization is not the held one, opens the member's vault with the
      secret, reseals it under the password with `SHIPPING_KDF` and `must_change_password`
      false, consumes the invitation, pushes, records `member_id` and `role`, and answers the
      session. A second accept of the same link is refused as consumed. Asserted in `join.rs`
      over the `invited` builder.
- [ ] `join::inspect` answers `LinkFacts` with `standing` produced again for an invitation link
      and `invitation: Some(username)` where the secret opens the row; `none` and `None` for an
      organization link. Asserted.
- [ ] `invite::invitation_link(store, session, invitation_id)` rebuilds the link from
      `sealed_secret` for the issuer and refuses everybody else; `revoke_invitation` on a member
      who never accepted removes them through `removal::remove_member`'s ordinary path, and on a
      reset link deletes the row alone. Asserted, including that the removed member's vault
      unseals no grant.
- [ ] `join::admit` loses its handed-password branches: a member with `must_change_password`
      set is not a state this build produces, and the sign-in path treats the flag as false.
- [ ] `command.rs`, `host.ts`, `platform/tauri.ts` and `organization/router.ts` carry
      `invitation_accept(link, password)` (public), `invitation_link(invitation_id)`,
      `member_reset(member_id)` in place of `invitation.reissue`, and `member_invite` with
      `workspaces: { id, access }[]`; `Invited` and `LinkFacts` in `host.ts` match the Rust
      shapes; `invite-form.svelte` and its test compile against `Invited` with the result panel
      showing one link and one copy control (its full redraw is ticket 10's).
- [ ] The secrecy sweep in `join.rs` still finds no plaintext secret in any row, the generated
      password included, and a changeset for `@rentable/desktop` rides with the change.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass.

## Relevant areas

`apps/desktop/tauri/src/organization/{link,invite,join,session,removal,command}.rs`;
`apps/desktop/src/lib/platform/{host,tauri}.ts`, `organization/{router,dialogs.svelte}.ts`,
`organization/component/invite-form.svelte` and its test.

## Constraints

- **Read [[efforts/826-the-organization-and-the-way-in-are-rethought/plan]], *The invitation
  link carries the generated password as its secret* and *Interfaces*.**
- **[[rules/credentials]]**: the secret crosses inside the link string and nowhere else; no
  command answers a password.
- **`vault.rs` is not changed.** `create_vault_with_secret`, `open_vault` and `reseal_vault` are
  what accept and issue use. A change there is a return to plan.
- **The invitation signature's preimage is unchanged** (`...invitation.v2` over `id`,
  `member_id`, `expires_at`).

## Notes

`sealed_secret` and `issued_by` already exist from ticket 01; this ticket is what reads them.
