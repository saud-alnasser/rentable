---
status: open
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

- [ ] The breadcrumb separator is on the mirror list and mirrors in Arabic. Component test in `rtl`.
- [ ] Every cell or title that renders user-entered text isolates it (`dir="auto"` or `<bdi>`), so a
      Latin value keeps its order in an Arabic line. A component test renders a name ending in a
      period and an address starting with a number under `rtl` and asserts the isolation.
- [ ] A unit's status on its page and on unit rows carries its word (visible or as the accessible
      name with a tooltip), like every other status cell. Component test.
- [ ] Disabled buttons meet 3:1 against their surface in both appearances; the contrast test from
      ticket 01 covers the disabled pair.
- [ ] The tab strip and lists show no scrollbar thumb when their content does not overflow.

## Relevant areas

- `layout/component/breadcrumb.svelte`, `design/cell/*`, `packages/design/src/lib/block/record-surface.svelte`
- `complex/component/unit-*`, `packages/design/src/lib/tokens.css`, `block/section-switch.svelte`,
  `design/block/list.svelte`
