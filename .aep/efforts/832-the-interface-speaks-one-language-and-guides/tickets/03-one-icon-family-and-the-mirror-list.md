---
status: resolved
---

# refactor(desktop): one icon family, and a written list of what mirrors

## Outcome

Every icon is lucide, at sizes from a named set. A menu's items either all carry icons or none do.
Which glyphs mirror in Arabic is written as one list, and every glyph on it mirrors. The two
bidirectional suspects in the evidence inventory are resolved.

## Acceptance Criteria

Traces requirements 3 and 22 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criteria 3 and 22(c).

- [x] `@tabler/icons-svelte` leaves `apps/desktop/package.json`. A node test asserts no source file
      imports it. Each tabler glyph is replaced by its lucide equivalent, and the concept keeps the
      same glyph everywhere (plus, x, chevron-down, search, edit is `square-pen`). Verified: `@tabler/icons-svelte` is gone from apps/desktop/package.json and the lockfile; `design/tests/icons.test.ts` forbids the import and passes on the merged effort branch (with motion and toast lint, 8 of 8); edit is `square-pen`.
- [x] The icon size set is written in `[[rules/frontend]]` *Styling*, and the outliers from
      `size-2` to `size-7` are brought onto it. Verified: the size set (`size-3.5`, `size-4`, `size-5`) is written in *Styling*; the 2, 3, 4.5 and 7 outliers moved onto it; primitives keep ported sizes.
- [x] A component test over the shared menus asserts items carry icons all or none. Verified: `design/tests/menu-icons.svelte.test.ts` (filter, sort, transfer, account, workspace menus) and the record card's two-route test pass; desktop vitest 247 of 247, design 78 of 78 on the merged tree.
- [x] `[[rules/frontend]]` *i18n* carries the mirror list: back and next, sequence chevrons,
      progress and sliders mirror; a clock, check, search glass, logo or slash does not. Verified: *i18n* in `rules/frontend.md` carries the mirror list; `icons.test.ts` holds the tree to both halves; the slider takes `contract.direction`, pinned by a test.
- [x] `primitive/sidebar/sidebar-rail.svelte:28` no longer pairs `start-*` with a physical
      `-translate-x-1/2`. The `rtl:flex-row-reverse` on `block/record-surface.svelte:150` is either
      removed or justified in a comment, after both directions are looked at.
 Verified: the rail is placed by logical `-end-2`/`-start-2` with no translate (sidebar test); `rtl:flex-row-reverse` removed from the record surface with a comment explaining the frame's direction already places back at the start edge.
## Relevant areas

- `apps/desktop/src/lib/layout/destination.ts`, `layout/component/frame.svelte`, `palette.svelte`,
  the account and workspace menus, `design/block/list.svelte` (toolbar), `design/cell/*`,
  `dashboard/**`, `complex/**` (the tabler users per the evidence inventory)
- `packages/design/src/lib/primitive/sidebar/sidebar-rail.svelte`, `block/record-surface.svelte`

## Constraints

- Primitives are changed by hand, never regenerated.
