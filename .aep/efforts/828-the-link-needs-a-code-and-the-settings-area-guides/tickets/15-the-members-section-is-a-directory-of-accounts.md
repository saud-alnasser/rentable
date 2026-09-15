---
status: open
blocked-by: ['14']
---

# feat(settings): the members section is a directory of accounts

## Outcome

The members section is a directory of record cards, one per account, the way domain records
are shown, for the owner and administrators; each card names the account and its standing and
carries its acts in the card's own menu; the owner's card is removed by nobody and edited by
nobody but the owner; an account is added from the foot on the form surface. The rows and the
row-actions block of ticket 07 are gone.

## Acceptance Criteria

Traces requirement 19 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 19
and 12.

- [ ] `organization/component/members.svelte` draws the cards `complex/component/directory.svelte`
      draws, over `design/block/record-card.svelte`, one per account: the username, the role,
      the workspaces held and one line of standing (password not yet set, no machine signed in,
      a machine signed in) from the members query joined to the register (a read the members
      query gains); the card's `href` opens the account's edit surface in the section
      (`?section=members&account=<id>`); the card's `actions` are, by the same gates as today:
      edit (rename, role and permissions, workspaces and access), make a link, reset the
      password, sign out everywhere, remove; the owner's card carries none of these for an
      administrator and is not drawn with a menu, and carries the owner's own edits for the
      owner; the foot carries `add an account`, for a holder of `inviteMember`, opening the
      account form on the form surface; the section's sentence says accounts are made and
      changed here. `packages/design/src/lib/block/row-actions.svelte` and its test go, and the
      strings only the rows read go from both locales.
- [ ] `members.svelte.test.ts` finds, with an administrator session, one card per account with
      its standing, the add control at the foot, every act present or absent on the card's menu
      by its gate, and the owner's card without a menu; with the owner's session the owner's
      card offers the owner's edits; with a member session the area's test finds no section.
- [ ] The section was run against the human's organization from the run's worktree and the
      human looked at it before this ticket is resolved; what they said is recorded under Notes.
- [ ] Every string in both locales; `pnpm check`, `pnpm lint` and `pnpm test` pass; the
      changeset of ticket 03 is extended.

## Relevant areas

`apps/desktop/src/lib/organization/component/{members,invite-form,link-handover}.svelte`,
`apps/desktop/src/lib/organization/{query,dialogs.svelte}.ts`,
`apps/desktop/src/lib/organization/tests/members.svelte.test.ts`,
`apps/desktop/src/lib/settings/component/area.svelte`, `apps/desktop/src/lib/settings/section.ts`,
`apps/desktop/src/lib/complex/component/directory.svelte` (read, as the shape),
`packages/design/src/lib/block/{record-card,row-actions}.svelte`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *The
  directories*.**
- **[[rules/interface]], *Row activation* and *Record card actions***: activating a card opens
  its record; the acts are the card's menu.
- **The look is judged on real accounts**, never on mock data; the human is at the machine, so
  ask before driving the running application. Simple words, short lines.
- **The transfer act is ticket 17's**; leave room for it in the owner's menu and draw nothing.

## Notes
