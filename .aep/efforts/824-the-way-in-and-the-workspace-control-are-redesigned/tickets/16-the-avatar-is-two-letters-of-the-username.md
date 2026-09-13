---
status: open
blocked-by: [09]
---

# feat(layout): the avatar is two letters of the username

## Outcome

The rail's account control and each members row draw the first two characters of the username,
upper-cased, in the avatar.

## Acceptance Criteria

Traces requirement 24 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 24.

- [ ] `accountInitials` reads the username and returns its first two characters upper-cased,
      padding a shorter string rather than throwing; `account-menu.svelte` calls it with
      `session.username` and shows the username where the display name was. Asserted in the
      sidebar's test.
- [ ] Each members row renders the same avatar with the member's initials. Asserted in
      `members.svelte.test.ts`.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass.

## Relevant areas

`apps/desktop/src/lib/layout/component/account-menu.svelte`, `sync/account.ts` (`accountInitials`),
`organization/component/members.svelte`,
`packages/design/src/lib/primitive/avatar/` (read, not changed).

## Constraints

- **The design package is read and not changed.**
- **A changeset rides with the change.**
