---
status: open
blocked-by: [01]
---

# feat(design): named shape and elevation

## Outcome

Radii and shadows come from named tokens in Tailwind's `--radius-*` and `--shadow-*` namespaces:
a `raised` and an `overlay` shadow with a value per appearance, and a radius ladder. No surface
uses an arbitrary radius or shadow, and elevation reads the same way in light and dark.

## Acceptance Criteria

Traces requirement 5 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 5.

- [ ] `tokens.css` declares the radius ladder and the two shadows for each appearance. `--radius`
      stops being the input group's alone, or is folded into the ladder.
- [ ] A node lint test finds no `shadow-[` or `rounded-[` in `apps/desktop/src` or
      `packages/design/src`. The record card's arbitrary shadows (`record-card.svelte:27-29`) use
      the tokens.
- [ ] The ladder and which surface takes which step are written in `[[rules/frontend]]` *Styling*.

## Relevant areas

- `packages/design/src/lib/tokens.css`, `block/record-card.svelte`, dialogs and sheets
  (`rounded-3xl`, `shadow-xl`), the list container

## Constraints

- Built on ticket 01's two token blocks, because a shadow that reads in dark can vanish in light.
