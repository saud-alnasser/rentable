---
status: resolved
---

# fix(desktop): direction and legibility hold in both reading directions

## Outcome

In Arabic the breadcrumb's separator points the way the trail reads. A person's name or an address
written in Latin letters keeps its own order inside Arabic text, so "Adeline Wiegand Sr." and
"4253 Russel Motorway" read as typed. A unit's status is never colour alone. A disabled control is
legible in both appearances. No stray scrollbar shows where nothing scrolls.

## Acceptance Criteria

Traces requirements 3, 5 and 22 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criteria 3 and 22. Found by the walk of ticket 27 (findings 2, 3, 8, 13 and 15).

- [x] The breadcrumb separator is on the mirror list and mirrors in Arabic. Component test in `rtl`. Verified: the separator already mirrored (the walk's ar screenshot at pixel scale points left); an rtl component test in `breadcrumb.svelte.test.ts` pins it, and headless Edge confirmed it against the built CSS.
- [x] Every cell or title that renders user-entered text isolates it (`dir="auto"` or `<bdi>`), so a
      Latin value keeps its order in an Arabic line. A component test renders a name ending in a
      period and an address starting with a number under `rtl` and asserts the isolation. Verified: user text renders through one inline `<bdi>` isolate: the new `design/cell/text.svelte` for rows, the record surface's title and eyebrow, specification values and the record crumb; `text.svelte.test.ts` and `isolation.svelte.test.ts` pass (desktop vitest 334 of 334, design 108 of 108 on the merged tree).
- [x] A unit's status on its page and on unit rows carries its word (visible or as the accessible
      name with a tooltip), like every other status cell. Component test. Verified: a unit's status carries its word as accessible name and tooltip; `complex/tests/unit-status.svelte.test.ts` focuses it and reads the tooltip.
- [x] Disabled buttons meet 3:1 against their surface in both appearances; the contrast test from
      ticket 01 covers the disabled pair. Verified: disabled labels use `--disabled-foreground` and filled variants `bg-muted`; `tokens.test.ts` holds the pair to 3:1 and fails on `disabled:opacity-`; Edge measured 3.40:1 light and 3.71:1 dark.
- [x] The tab strip and lists show no scrollbar thumb when their content does not overflow.
 Verified: the section switch no longer overflows downward (its `-mb-px`), and scrollbar thumbs have a 2rem minimum so a long list's thumb is not a dot.
## Relevant areas

- `layout/component/breadcrumb.svelte`, `design/cell/*`, `packages/design/src/lib/block/record-surface.svelte`
- `complex/component/unit-*`, `packages/design/src/lib/tokens.css`, `block/section-switch.svelte`,
  `design/block/list.svelte`
