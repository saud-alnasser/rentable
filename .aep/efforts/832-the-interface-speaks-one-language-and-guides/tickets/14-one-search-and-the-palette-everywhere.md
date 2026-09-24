---
status: open
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

- [ ] The search field is one component, shared by the list shell, `contract/component/units.svelte`
      and the settings directories. Component tests assert the icon, the debounce and that `/`
      focuses it on each.
- [ ] The settings members and workspaces directories are drawn by the list shell or share its
      toolbar, with search and sort. Export is left out there unless it applies.
- [ ] A component test opens the palette with Mod+K on settings and on a record page.
- [ ] `[[rules/interface]]` gains a *Search* section.

## Relevant areas

- `apps/desktop/src/lib/design/block/list.svelte:538-551`, `contract/component/units.svelte:88-94`,
  `organization/component/members.svelte`, `workspaces.svelte`, `directory-tray.svelte`,
  `layout/component/palette.svelte`
