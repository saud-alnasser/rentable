---
status: resolved
---

# feat(design): Readex Pro and one type scale

## Outcome

Both locales render in Readex Pro, bundled with the design package and loaded offline. Every text
size and weight in application and package code comes from one named scale. Money and counts use
tabular numerals, and no letter spacing ever applies to Arabic text.

## Acceptance Criteria

Traces requirements 1 and 22 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criteria 1 and 22(d).

- [x] Readex Pro (variable) ships as subset `woff2` under `packages/design/src/lib/fonts/`, with its
      SIL Open Font License beside it. `@font-face` in `tokens.css` uses `font-display: block`, and
      `--font-sans` names it first, then `system-ui`. A node test asserts every file `@font-face`
      names exists. Verified: Readex Pro Latin and Arabic subsets (54,020 bytes) and OFL.txt under `packages/design/src/lib/fonts/`; `@font-face` uses `block`, `--font-sans` leads with it then `system-ui`; `typography.test.ts` asserts the files exist; design node suite 133 of 133 on the merged effort branch.
- [x] The type scale is written in `[[rules/frontend]]` *Styling*: which Tailwind sizes and weights
      are in use, and for what. A node lint test finds no arbitrary `text-[` in
      `apps/desktop/src` or `packages/design/src`, and the existing arbitrary sizes are replaced. Verified: the scale is written in *Styling*; both packages' typography lint finds no `text-[` (desktop node 1016 of 1016, design 133 of 133 on the merged tree).
- [x] The money and count cells render `tabular-nums` (a component test on each). Verified: `design/cell/tests/figures.svelte.test.ts` (money, count, status count) passes in desktop vitest 250 of 250; Readex Pro has no `tnum`, so the Latin subset is patched with one (every digit advances 672 units at wght 160 to 700, HarfBuzz), and a node test fails on the unpatched file.
- [x] No `tracking-*` class sits on an element that renders reader's text. A node lint test fails
      on `tracking-` outside an allowlist of machine strings (for example the link code). Verified: the typography lint fails on `tracking-` outside the link code and shortcut primitives, and passes on the merged tree; the record surface's eyebrow and title lost their tracking at integration.
- [x] Arabic line height is set so mixed-script lines do not clip, and it is checked by eye on a
      contract record in Arabic.
 Verified: the human looked at a contract record in Arabic in the running app on 2026-09-24 and reported it works; `:root:lang(ar)` sets 1.8 across the scale (HarfBuzz floor 1.75). Folded into this commit: the dev server's `fs.allow` now admits the design package's fonts, which it refused.
## Relevant areas

- `packages/design/src/lib/tokens.css`, `packages/design/package.json` (`files` already ships `src`)
- the arbitrary sizes `text-[0.72rem]`, `text-[0.8rem]` and `text-[10px]` (grep)
- `apps/desktop/src/lib/design/cell/*` (money, count)

## Constraints

- The fontsource packages used by the prototype are not added. The font files are committed.
- Offline-first: nothing loads from a network.

## Notes

The typeface was chosen on the seeded workspace, over Inter with IBM Plex Sans Arabic and Inter
with Noto Sans Arabic
([[efforts/832-the-interface-speaks-one-language-and-guides/evidence/prototypes/the-typeface-pair]]).
