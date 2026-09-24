---
status: open
---

# refactor(desktop): one icon family, and a written list of what mirrors

## Outcome

Every icon is lucide, at sizes from a named set. A menu's items either all carry icons or none do.
Which glyphs mirror in Arabic is written as one list, and every glyph on it mirrors. The two
bidirectional suspects in the evidence inventory are resolved.

## Acceptance Criteria

Traces requirements 3 and 22 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criteria 3 and 22(c).

- [ ] `@tabler/icons-svelte` leaves `apps/desktop/package.json`. A node test asserts no source file
      imports it. Each tabler glyph is replaced by its lucide equivalent, and the concept keeps the
      same glyph everywhere (plus, x, chevron-down, search, edit is `square-pen`).
- [ ] The icon size set is written in `[[rules/frontend]]` *Styling*, and the outliers from
      `size-2` to `size-7` are brought onto it.
- [ ] A component test over the shared menus asserts items carry icons all or none.
- [ ] `[[rules/frontend]]` *i18n* carries the mirror list: back and next, sequence chevrons,
      progress and sliders mirror; a clock, check, search glass, logo or slash does not.
- [ ] `primitive/sidebar/sidebar-rail.svelte:28` no longer pairs `start-*` with a physical
      `-translate-x-1/2`. The `rtl:flex-row-reverse` on `block/record-surface.svelte:150` is either
      removed or justified in a comment, after both directions are looked at.

## Relevant areas

- `apps/desktop/src/lib/layout/destination.ts`, `layout/component/frame.svelte`, `palette.svelte`,
  the account and workspace menus, `design/block/list.svelte` (toolbar), `design/cell/*`,
  `dashboard/**`, `complex/**` (the tabler users per the evidence inventory)
- `packages/design/src/lib/primitive/sidebar/sidebar-rail.svelte`, `block/record-surface.svelte`

## Constraints

- Primitives are changed by hand, never regenerated.
