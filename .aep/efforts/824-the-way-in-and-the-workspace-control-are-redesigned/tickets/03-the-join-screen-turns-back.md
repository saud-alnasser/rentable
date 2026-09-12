---
status: open
---

# feat(organization): the join screen turns back

## Outcome

Every step of the join screen can be left by a control in the card's corner: the paste and
unreadable steps return to the wall, every later step returns to paste. The "paste another link"
links are gone, and the screen's buttons and fields carry the vocabulary.

## Acceptance Criteria

Traces requirement 1, requirement 14 and requirement 15 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 1.

- [ ] On `paste`, `unreadable`, `inspecting`, `password`, `restore` and `refused`, exactly one
      `getByRole('button', { name: back })` renders in the corner and its click calls `onBack`;
      `onPasteAnother` no longer exists and `grep` finds no "paste another" in the component.
- [ ] The route's `onBack` goes to `THE_WAY_IN` from `paste` and `unreadable`, and to `paste`
      from every other step, keeping what `onPasteAnother` did there.
- [ ] The unlock and restore buttons carry their verb glyph; the link, email and password fields
      carry muted leading glyphs through `input-group`.
- [ ] `join.pasteAnother` is removed and `join.back` added in both locales.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass.

## Relevant areas

`apps/desktop/src/lib/organization/component/join-screen.svelte`, `routes/organization/join/`,
`organization/tests/join-screen.svelte.test.ts`, `organization/join.ts` for the step kinds.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *Back is SurfaceAction in the corner slot*.**
- **Nothing about what the link does changes**: inspecting, joining and restoring keep their
  calls; only where the screen can go and what its controls carry.
- **A changeset rides with the change.**
