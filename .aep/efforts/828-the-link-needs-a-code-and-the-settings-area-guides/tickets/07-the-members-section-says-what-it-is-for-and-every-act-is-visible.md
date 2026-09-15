---
status: open
blocked-by: ['03']
---

# feat(settings): the members section says what it is for and every act is visible

## Outcome

The members section opens with a sentence saying who is listed and that the owner and
administrators make and change accounts here, with the invite control beside it; every row
carries one visible control opening the row's acts in four groups, and the hover cluster is
gone. The block that draws the control and its menu lives in the design package, so the
workspaces section draws the same one. The human has looked at it against the real
organization before this ticket is resolved.

## Acceptance Criteria

Traces requirement 6 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 6
and 12.

- [ ] `packages/design/src/lib/block/row-actions.svelte` takes `label` and `groups:
      RecordCardAction[][]` over the type `record-card.svelte` exports, draws an outline
      `icon-sm` button with the ellipsis glyph, labelled in a tooltip and to a screen reader,
      opening a `DropdownMenu` of the groups separated by `DropdownMenu.Separator`, each item
      the glyph and the label and a `destructive` variant where the action says so; a group
      with no actions draws no separator; a test under `packages/design/src/lib/block/tests`
      opens it and finds the groups and the separators.
- [ ] `organization/component/members.svelte` draws above the list one row: the legend and a
      `Field.Description` sentence on the start side and the invite button on the end side
      for a holder of `inviteMember`; the `action` snippet and the hover cluster go; each row
      ends in one `row-actions` control whose groups are, in order, rename; role and
      permissions, workspaces and access; copy link on a pending row for its issuer, new
      link, sign out everywhere, revoke on a pending row; remove, and lock out for the owner;
      an act the session lacks is absent, and the owner's row and the reader's own offer what
      they offer today. The data attributes each act carried move onto the menu items.
- [ ] `members.svelte.test.ts` finds the sentence, the invite control before the first row,
      and for an administrator session opens each row's control and finds every act present
      or absent by the same gates the test asserts today; with a member session the area's
      test still finds the section absent.
- [ ] The section was run against the human's organization from this run's worktree and the
      human looked at it before the ticket is resolved; what they said is recorded under
      Notes.
- [ ] Every new or changed string is written in both locales; `pnpm check`, `pnpm lint` and
      `pnpm test` pass; the changeset of ticket 03 is extended.

## Relevant areas

`packages/design/src/lib/block/{row-actions,record-card}.svelte` and
`packages/design/src/lib/block/tests`, `apps/desktop/src/lib/organization/component/members.svelte`,
`apps/desktop/src/lib/organization/tests/members.svelte.test.ts`,
`apps/desktop/src/lib/settings/component/area.svelte`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *Members
  and workspaces rows carry one visible control*.**
- **[[rules/interface]], *Row activation* and *Record card actions***: the row itself opens
  nothing; the control is the route.
- **[[rules/frontend]]**: the block reaches nothing but the design system, which is what puts
  it in the package; a reach past it moves it to `design/block/` here.
- **The look is judged on real rows** (spec, *Constraints*), never on mock data; the human is
  at the machine, so ask before driving the running application.
- **[[rules/interface]], *The visual reference***: this reshapes a surface, so the navigation
  file is opened where it exists; where it is absent, say so and proceed on the repository's
  own standards.

## Notes
