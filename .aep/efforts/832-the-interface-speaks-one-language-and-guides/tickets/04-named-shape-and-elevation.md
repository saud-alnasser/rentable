---
status: resolved
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

- [x] `tokens.css` declares the radius ladder and the two shadows for each appearance. `--radius`
      stops being the input group's alone, or is folded into the ladder. Verified: `tokens.css` clears stock radii and shadows, declares the ladder xs to 3xl and `--elevation-raised/-overlay/-sunken` in both `:root` and `.dark`; `--radius` removed (input group takes `rounded-lg`); design `shape.test.ts` compiles Tailwind and passes 11 of 11 on the effort branch.
- [x] A node lint test finds no `shadow-[` or `rounded-[` in `apps/desktop/src` or
      `packages/design/src`. The record card's arbitrary shadows (`record-card.svelte:27-29`) use
      the tokens. Verified: both `shape.test.ts` lint files pass on the merged tree (desktop node 1025 of 1025, including ticket 06's new list code); the child showed both fail on the 15 old uses; the record card takes `shadow-raised` and `hover:shadow-overlay`.
- [x] The ladder and which surface takes which step are written in `[[rules/frontend]]` *Styling*.
 Verified: the ladder and elevation tables are in `rules/frontend.md` *Styling*; validate.mjs no failures.
## Relevant areas

- `packages/design/src/lib/tokens.css`, `block/record-card.svelte`, dialogs and sheets
  (`rounded-3xl`, `shadow-xl`), the list container

## Constraints

- Built on ticket 01's two token blocks, because a shadow that reads in dark can vanish in light.
