---
status: resolved
---

# feat(design): a motion vocabulary

## Outcome

Motion is drawn from named tokens: `--ease-enter`, `--ease-exit`, `--ease-move`, and
`--duration-quick`, `--duration-base` and `--duration-slow` (150, 200, 250 ms). No component sets
its own duration or easing. Nothing animates on keyboard list navigation or in the command menu.
Reduced motion turns every transform and fade off, view transitions included. The frontend rule's
motion section describes the vocabulary and no longer calls moving an element unavailable.

## Acceptance Criteria

Traces requirement 4 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criteria 4(a), 4(b) and 4(d).

- [x] The tokens are declared in `tokens.css`, with utilities or `@theme` entries so a component
      names them rather than a number. Verified: `tokens.css` declares the three easings and three durations in a `@theme static` block; design `src/lib/tests/motion.test.ts` compiles the tokens with Tailwind and passes 6 of 6 on the effort branch.
- [x] A node lint test finds no raw `duration-<n>`, `ease-in`, `ease-out`, `ease-in-out`,
      `ease-linear` or `animation-duration-*` outside the tokens' definition. The ad hoc values
      listed in the evidence inventory are replaced. Verified: `apps/desktop/src/lib/design/tests/motion.test.ts` scans both trees and passes 2 of 2 on the combined tree (including ticket 15's new loading block); the child showed it fails on the old sheet's `duration-3`/`ease-in-out`.
- [x] The reduced-motion block in `tokens.css` also stops `::view-transition-*` animations. A
      component test with reduced motion asserts no transform or opacity animation is applied to
      a sheet, a dialog and the record card. Verified: the reduced-motion block stops `::view-transition-*`; `reduced-motion.svelte.test.ts` covers sheet, dialog and record card; design vitest passes 74 of 74 on the effort branch.
- [x] The palette and `list-keyboard` movement carry no transition. Verified: the command dialog passes `motion={false}`, pinned by `command.svelte.test.ts`; `record-card.svelte.test.ts` asserts focusing a card starts no transition; both in the 74 passing.
- [x] `[[rules/frontend]]` *Motion* states the vocabulary, the mechanisms (CSS, `tw-animate-css`,
      `svelte/motion`, `svelte/animate`, view transitions with a fallback), and drops
      "unavailable".
 Verified: `rules/frontend.md` *Motion* holds the vocabulary and mechanisms tables and no longer says unavailable (grep finds none); validate.mjs no failures.
## Relevant areas

- `packages/design/src/lib/tokens.css` (reduced motion at `:209-236`)
- the per-component durations: button, dialog, accordion, sidebar (200), sheet (300/500), item
  (100), record card (150), surface action (500), ring (700), form surface
- `apps/desktop/src/lib/layout/component/palette.svelte`, `design/list-keyboard.ts`

## Constraints

- No motion dependency is added.
- The looping indicators (spinner, skeleton, caret) keep moving under reduced motion, as the token
  layer's comment explains.
