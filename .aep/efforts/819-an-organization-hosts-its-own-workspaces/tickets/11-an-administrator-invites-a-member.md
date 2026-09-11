---
status: resolved
blocked-by: ['10']
---

# feat(organization): an administrator invites a member

## Outcome

The administration dashboard invites a member by email, names their role and the workspaces they
belong to, and produces a link and a generated password. The application says plainly that it
cannot send them. An invitation has a lifetime, is revocable, and is reissuable. Which acts a
member may perform is decided by their role, and every act in `ADMINISTRATION` is covered.

## Acceptance Criteria

Traces requirement 7, requirement 11, requirement 12, requirement 21 and requirement 23 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 7, criterion 12,
criterion 21 and criterion 23.

- [x] Inviting produces a link and a generated password, and the interface states that it cannot
      send them and offers what a person needs in order to send them themselves. **The generated
      password is not derived from the email or the display name**, and a test asserts that rather
      than asserting it merely differs.
      *Verified: `organization/invite.rs::invite_member` writes the member's vault under a drawn
      password, seals the content key and the grants to them, and returns `Invited` with the join
      link carrying the invitation's half and the password shown once;
      `an_invitation_makes_a_member_a_link_and_a_password_and_both_halves_open_it` pins it. The
      dashboard's `invite-form.svelte` shows a warning callout, `organization.dashboard.cannotSend`,
      above the link and the password as `dir="ltr"` machine strings with a copy control each;
      `invite-form.svelte.test.ts` asserts the statement, the two strings, and the two controls in
      both locales. `the_generated_password_is_drawn_and_not_derived` invites twice with identical
      inputs, gets different passwords, and asserts no word of the email or the display name
      appears in either, and that every character is from the alphabet; `generate_password` draws its bytes from the operating
      system and nothing about the person enters it.*
- [x] The invitation needs both halves to open: the link carries the invitation secret, the person
      carries the generated password, and neither alone yields anything. The schedule is in
      [[efforts/819-an-organization-hosts-its-own-workspaces/plan]] and is not restated here.
      *Verified: the payload is sealed under `HKDF(invitation secret, Argon2id(generated password,
      salt))`, `invite.rs::seal_invitation`, and the row carries the salt and the cost with no key.
      `an_invitation_makes_a_member_a_link_and_a_password_and_both_halves_open_it` opens the payload
      with both halves and finds the member row, then asserts the link's secret with a wrong
      password and the right password with a wrong secret each fail to open it.*
- [x] An invitation past its lifetime is refused, and opening its link still names the organization
      and says the invitation lapsed rather than failing. An administrator revokes an unused
      invitation and the link stops working. **The link itself never expires**, which is requirement
      23's distinction.
      *Verified: the row carries `expires_at`, `INVITATION_LIFETIME_MS` (seven days) from issue, and
      `invitations()` reports `InvitationStanding::{Open,Lapsed,Consumed}` against the clock it is
      given; the link is `JoinLink` with the organization's id, name, and read-only locator and no
      expiry of its own. `an_invitation_lapses_is_revocable_and_is_reissuable_while_the_link_stands`
      moves the clock past the lifetime and reads `Lapsed`, parses the link afterwards and still
      finds the organization by name, revokes and finds the invitation half naming nothing, then
      reissues and opens the fresh vault with the fresh password and not the old. The dashboard's
      `invitations.svelte` draws the three standings and offers revoke on the unused ones, and
      `members.svelte` offers reissue on every row but the owner's. Opening a link end to end is
      ticket 12's, which this row's standing is what it reads.*
- [x] A table test covers every act in `ADMINISTRATION` against every role, and it iterates the
      package's own export rather than a copied list, so an act added to
      `packages/workspace-permission` without a role decision fails the test.
      *Verified: `organization/tests/administration.test.ts` iterates `EVERY_ADMINISTRATION` from
      `@rentable/workspace-permission` against `ADMINISTRATION_BY_ROLE` for all three roles, with the
      decided table typed `Record<Administration, Record<Role, boolean>>` so a new act fails the
      typecheck, and a `deepEqual` of the table's keys against the export so it fails at runtime too.
      The Rust side, `organization/permission.rs`, reads the package's own source in a test and holds
      the six bits and the three role masks to it.*
- [x] Administration is enforced by what a member's vault holds and not by what the interface
      shows. A member without the authority who calls the command directly is refused by the
      command.
      *Verified: `invite_member`, `reissue_invitation`, and `revoke_invitation` take the
      `MemberSession` the vault opened and refuse on `permission::require(.., Administration::InviteMember)` against the
      signed row's mask, before any write; `administration_is_what_the_row_carries_and_the_organization_key_is_the_owners`
      has a member refused an invite, an administrator refused inviting an administrator (the
      organization key is the owner's), and the owner inviting both; and
      `an_unsettled_inviter_and_an_unreachable_workspace_are_both_refused` has a member who must
      still change their password refused, and an invitation into a workspace the inviter holds no
      grant on refused by name. The commands `member_invite`, `invitation_reissue`, and
      `invitation_revoke` go through `signed_in` and these functions and add no gate of their own,
      so the interface's `canInvite` changes nothing about what is refused.*
- [x] Only an owner may create or destroy a workspace, and an administrator asking for one is told
      to ask the owner. There is **no request queue**: the spec puts it out of scope by name and it
      is the obvious thing to build unasked.
      *Verified: ticket 14's `workspace_create` and `workspace_delete` refuse anybody but the owner
      before any request. The dashboard's `workspaces.svelte` draws the create form for the owner
      and `layout.noWorkspace.ownerOnly` for everybody else, with no control behind it;
      `invite-form.svelte.test.ts` asserts the form is present for the owner and absent, with no
      input at all, for an administrator, who gets the sentence. No table, command, or procedure
      records a request.*
- [x] Both locales, both directions.
      *Verified: `organization.dashboard.*` (28 strings) and `common.nav.organization` added to
      `en/index.ts`, `ar/index.ts`, and the generated `i18n-types.ts`; `pnpm check` reports 0 errors
      so no key is referenced without both. The link and the password are `dir="ltr"` inside either
      direction, asserted in the Arabic render of the result panel.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.
      *Verified: 2026-09-12. `pnpm check` 0 errors, 0 warnings; root `pnpm lint` (prettier and
      eslint) clean; `pnpm test` 892 node tests and 23 component tests pass; `vite build` builds.
      `cargo test --test-threads=1` 316 passed, 0 failed, 8 ignored; `cargo clippy --all-targets`
      the same five warnings that stand at the branch point, none in `organization/`;
      `cargo fmt --check` clean.*

## Relevant areas

`packages/workspace-permission/index.ts` holds `ADMINISTRATION`, `ADMINISTRATION_BY_ROLE`,
`maskOf`, `permits`, `HIGHEST_USABLE_BIT = 52` and `Role`. It is unchanged by this effort and it is
already the vocabulary.

`apps/desktop/src/lib/organization/` gains the dashboard. `organization/store.rs` from ticket 08
holds the `invitation` and `grant` tables, and `authority.rs` from ticket 07 signs what is created.

`apps/control-plane/src/database/schema.ts::membership` shows how role and permissions were paired
before, and the `permissions` integer is the same mask.

## Constraints

- **We register with no mail service.** Requirement 7 is explicit and the constraint is in the
  spec: adding one would be registering with a service on the customer's behalf.
- **[[rules/credentials]], *Client boundary*.** The generated password is shown to the
  administrator once, from a Rust command, and the sealed payload never crosses.
- **An invitation is signed** by the administrator who created it, under ticket 07's chain. An
  unsigned invitation row is one any member could have written.

## Notes

Gated on ticket 10 because an administrator has to be signed in to invite anybody, and the owner
created in ticket 09 is the first one.

Ticket 12 is what makes an invitation usable. They are split because inviting and joining fail in
different places and are worth reviewing apart.
