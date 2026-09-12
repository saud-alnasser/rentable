---
status: open
---

# feat(layout): the wall picks an organization

## Outcome

A machine that has joined several organizations shows them on the wall as rows a person picks
from, each carrying its name and role, the password field under the chosen one. One organization
is named as today. The wall's shape does not otherwise move, and its unlock and password carry the
vocabulary.

## Acceptance Criteria

Traces requirement 7, requirement 14 and requirement 15 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 7.

- [ ] With two organizations, `startup-sign-in.svelte.test.ts` finds two `[role=radio]` rows
      each carrying name and role, the password field, and no `select`; pressing the second row
      and submitting calls `onSignIn` with the second organization's id. With one, the name and
      role render as the text line they are today.
- [ ] The unlock button carries its verb glyph; the password field carries a muted leading glyph.
- [ ] The wall's title, description and password sentence are byte-identical to before.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass.

## Relevant areas

`apps/desktop/src/lib/layout/component/startup-sign-in.svelte` and its test;
`packages/design/src/lib/primitive/radio-group/` and `primitive/item/` are read, not changed.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *The wall's picker is a radio group*, and the technical risk on the radio group
  inside the wall's form.**
- **The look is settled on screen against the human's two joined organizations**; ask before
  driving the app.
- **The wall's shape is the human's, settled 2026-08-20** (the component's own comment). Rows are
  drawn inside it; nothing else on the wall moves.
- **A changeset rides with the change.**
