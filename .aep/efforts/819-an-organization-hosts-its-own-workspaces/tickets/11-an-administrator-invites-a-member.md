---
status: open
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

- [ ] Inviting produces a link and a generated password, and the interface states that it cannot
      send them and offers what a person needs in order to send them themselves. **The generated
      password is not derived from the email or the display name**, and a test asserts that rather
      than asserting it merely differs.
- [ ] The invitation needs both halves to open: the link carries the invitation secret, the person
      carries the generated password, and neither alone yields anything. The schedule is in
      [[efforts/819-an-organization-hosts-its-own-workspaces/plan]] and is not restated here.
- [ ] An invitation past its lifetime is refused, and opening its link still names the organization
      and says the invitation lapsed rather than failing. An administrator revokes an unused
      invitation and the link stops working. **The link itself never expires**, which is requirement
      23's distinction.
- [ ] A table test covers every act in `ADMINISTRATION` against every role, and it iterates the
      package's own export rather than a copied list, so an act added to
      `packages/workspace-permission` without a role decision fails the test.
- [ ] Administration is enforced by what a member's vault holds and not by what the interface
      shows. A member without the authority who calls the command directly is refused by the
      command.
- [ ] Only an owner may create or destroy a workspace, and an administrator asking for one is told
      to ask the owner. There is **no request queue**: the spec puts it out of scope by name and it
      is the obvious thing to build unasked.
- [ ] Both locales, both directions.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

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
