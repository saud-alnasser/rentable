---
status: open
---

# fix(design): the callout carries the slot attribute every other primitive carries

## Outcome

A test that wants the callout on a composed surface asks for the callout, the way it asks for a
dialog title or a dialog footer, rather than for a class list.

## Acceptance Criteria

Traces requirement 5 of the spec, and its criterion 5.

- [ ] `packages/design/src/lib/primitive/callout/callout.svelte` renders `data-slot="callout"`
      on its root, as every other primitive family does.
- [ ] The two block tests that anchor on its shape instead ask for the slot, and the comment
      explaining why they could not goes with the workaround.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass.

## Relevant areas

`packages/design/src/lib/primitive/callout/callout.svelte`.

The two anchors written around the gap are
`packages/design/src/lib/block/tests/delete-dialog.svelte.test.ts` and
`packages/design/src/lib/block/tests/selection-dialog.svelte.test.ts`. Both reach for
`div.rounded-md.border`, which is a class list rather than a name, and both carry a comment
saying so.

## Constraints

- **The attribute is the convention and not an addition.** Check what the other families spell
  it as before writing it, so the callout joins them rather than starting a second spelling.

## Notes

Found while writing the first tests that render a callout, at #781, and raised as #796. Nothing
is broken today: the surfaces draw correctly and the tests pass. What the gap costs is that a
test asserting on the error line is held to the callout's styling, so a change that is purely
visual breaks a test about words.
