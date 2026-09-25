---
status: resolved
blocked-by: [11]
---

# feat(desktop): one search, and the command menu on every screen

## Outcome

Every searchable set searches the same way: the list shell's field, its debounce and `/`. That
covers the contract's unit panes and the settings members and workspaces directories. The command
menu opens on Ctrl/Cmd+K from every route, settings and record pages included.

## Acceptance Criteria

Traces requirements 6 and 7 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criterion 7.

- [x] The search field is one component, shared by the list shell, `contract/component/units.svelte`
      and the settings directories. Component tests assert the icon, the debounce and that `/`
      focuses it on each. Verified: `design/block/search-field.svelte` (glass, 250 ms debounce, registers `/`) serves the list shell, the contract units panes and the settings directories; tests on each through `design/tests/search.ts`; desktop vitest passes on the merged tree.
- [x] The settings members and workspaces directories are drawn by the list shell or share its
      toolbar, with search and sort. Export is left out there unless it applies. Verified: members and workspaces use the shared `list-toolbar` with search and sort and no export; `organization/tests/directory.test.ts` covers Arabic-Indic digits; desktop node 1100 of 1100 on the merged tree.
- [x] A component test opens the palette with Mod+K on settings and on a record page. Verified: `layout/tests/palette.svelte.test.ts` opens the palette with Mod+K on the settings area and on a record page, 4 of 4 on the merged tree (its settings marker moved from the deleted rail to `data-section-switch` at integration).
- [x] `[[rules/interface]]` gains a *Search* section.
 Verified: `rules/interface.md` gains *Search*; validate.mjs no failures.
## Relevant areas

- `apps/desktop/src/lib/design/block/list.svelte:538-551`, `contract/component/units.svelte:88-94`,
  `organization/component/members.svelte`, `workspaces.svelte`, `directory-tray.svelte`,
  `layout/component/palette.svelte`
