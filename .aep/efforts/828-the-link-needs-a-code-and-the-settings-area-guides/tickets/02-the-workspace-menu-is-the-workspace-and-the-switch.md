---
status: open
---

# feat(layout): the workspace menu is the workspace and the switch

## Outcome

The rail's workspace menu is its header, the workspaces the member holds with the open one
marked, and one row to the workspaces section of settings. Invite and new workspace, with
their refusal sentences, are gone from it; both remain in the settings area, where the
members and workspaces sections offer them.

## Acceptance Criteria

Traces requirement 9 of [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]],
and its criterion 9.

- [ ] `layout/component/workspace-menu.svelte` loses the `canInvite`, `canCreateWorkspace`
      and `refusal` props, the side-by-side pair and the create row at the foot; it draws the
      header, the radio group of workspaces with the open one checked, and one full-width row
      to `withSection('workspaces')` at the foot, carrying `data-workspace-menu-workspaces`.
- [ ] `layout/component/sidebar.svelte` stops computing `canInvite`, `canCreateWorkspace`
      and `refusal` for the menu; `workspaceMenu.invite`, `workspaceMenu.inviteRefused` and
      `workspaceMenu.workspaceRefusedOwner` are removed from both locales and from
      `i18n-types.ts`; `workspaceMenu.create` and `workspaceMenu.workspaceRefusedAuthority`
      stay, since the workspaces section reads them.
- [ ] `layout/tests/workspace-menu.svelte.test.ts` finds the header, the radio rows with the
      open one checked, one workspaces row, and no element carrying
      `data-workspace-menu-invite`, `data-workspace-menu-create` or
      `data-workspace-menu-invite-refusal`; the sidebar's test, where it asserted the refusal
      sentences, no longer does.
- [ ] The invite dialog and the workspace dialog still open from the members and workspaces
      sections through `openOrganizationDialog`; `layout/component/organization-dialogs.svelte`
      is unchanged.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass; a changeset for `@rentable/desktop`
      rides with the change.

## Relevant areas

`apps/desktop/src/lib/layout/component/{workspace-menu,sidebar}.svelte`,
`apps/desktop/src/lib/layout/tests/workspace-menu.svelte.test.ts`,
`apps/desktop/src/lib/i18n/{en,ar}/index.ts`, `apps/desktop/src/lib/i18n/i18n-types.ts`.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *The two
  menus*.**
- The menu's docstring is rewritten to say what the menu is now and to date what it was;
  the ClickUp reference of 2026-08-20 and 826's requirement 17 are named as what it was.
- Strings that retire are removed, never left as unused keys.

## Notes
