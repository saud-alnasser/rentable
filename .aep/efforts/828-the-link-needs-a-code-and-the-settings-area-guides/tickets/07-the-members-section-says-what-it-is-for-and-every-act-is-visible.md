---
status: obsolete
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

- [x] `packages/design/src/lib/block/row-actions.svelte` takes `label` and `groups:
      RecordCardAction[][]` over the type `record-card.svelte` exports, draws an outline
      `icon-sm` button with the ellipsis glyph, labelled in a tooltip and to a screen reader,
      opening a `DropdownMenu` of the groups separated by `DropdownMenu.Separator`, each item
      the glyph and the label and a `destructive` variant where the action says so; a group
      with no actions draws no separator; a test under `packages/design/src/lib/block/tests`
      opens it and finds the groups and the separators. *Verified 2026-09-15 on the effort
      branch: `row-actions.svelte` takes `label: string` and `groups: RecordCardAction[][]` and
      draws only the groups with an action in them; `vitest run
      src/lib/block/tests/row-actions.svelte.test.ts` in `packages/design` printed `Tests 6
      passed (6)`; the menu opens on a click under jsdom, and the tooltip's content is asserted
      by the trigger's two names, the limit `back-control`'s test already records.*
- [x] `organization/component/members.svelte` draws above the list one row: the legend and a
      `Field.Description` sentence on the start side and the invite button on the end side
      for a holder of `inviteMember`; the `action` snippet and the hover cluster go; each row
      ends in one `row-actions` control whose groups are, in order, rename; role and
      permissions, workspaces and access; copy link on a pending row for its issuer, new
      link, sign out everywhere, revoke on a pending row; remove, and lock out for the owner;
      an act the session lacks is absent, and the owner's row and the reader's own offer what
      they offer today. The data attributes each act carried move onto the menu items.
      *Verified: `members.svelte` draws `Field.Set aria-labelledby="members-legend"`, the head
      row with `Field.Description data-members-description` and the invite, and one `RowActions`
      per row whose `actsOn` builds the four groups with every `data-member-*` attribute on the
      items; no `group-hover` or `opacity-0` remains in the file.*
- [x] `members.svelte.test.ts` finds the sentence, the invite control before the first row,
      and for an administrator session opens each row's control and finds every act present
      or absent by the same gates the test asserts today; with a member session the area's
      test still finds the section absent. *Verified: `vitest run
      src/lib/organization/tests/members.svelte.test.ts src/lib/settings/tests/area.svelte.test.ts`
      printed `Test Files 2 passed (2)`, `Tests 31 passed (31)`, including the section sentence,
      the owner seeing every action on every row but their own, each action drawn by its own act,
      the acts behind one visible control with the row opening nothing, and the plain member
      offered every section but members.*
- [ ] The section was run against the human's organization from this run's worktree and the
      human looked at it before the ticket is resolved; what they said is recorded under
      Notes.
- [x] Every new or changed string is written in both locales; `pnpm check`, `pnpm lint` and
      `pnpm test` pass; the changeset of ticket 03 is extended. *Verified in the run's worktree:
      `organization.dashboard.membersDescription` and `memberActions` in `en` and `ar`, the Arabic
      written; `typesafe-i18n --no-watch` leaves no drift; `pnpm check` exit 0 (desktop `9303
      FILES 0 ERRORS 0 WARNINGS`, design `2811 FILES 0 ERRORS`), `pnpm lint` exit 0, `pnpm test`
      exit 0 (design `64 passed`, desktop `177 passed`); the changeset carries a third paragraph.*

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

- *2026-09-15, at integration.* `RecordCardAction` gained two optional fields, `disabled` and
  `attributes`, passed on the card's dropdown and context routes; the row needed the first for
  its busy states and the second for the data attributes the test selects by. No existing caller
  changed. A rendered `<legend>` leaves its fieldset's layout, so the legend sits inside the head
  row and `Field.Set` carries `aria-labelledby`; the workspaces section meets the same constraint.
- The changeset conflicted with ticket 04's paragraph at integration; both paragraphs kept, in
  order.

- *Obsolete 2026-09-16.* Superseded by requirement 19 and ticket 15: the human, seeing these rows in the running build, chose a directory of record cards instead; the rows and the row-actions block were built and never looked at.
- *Accepted by the human, 2026-09-16, at review round one* (standards finding 9): this ticket's
  commit stays on the branch though the ticket is obsolete and ticket 15's commit undoes it;
  dropping it would rebase fourteen later commits, and after the squash merge nothing of it
  reaches main.
