---
status: open
blocked-by: [01]
---

# feat(desktop): the workspace control names where you are and checks it

## Outcome

The trigger at the head of the rail draws the mark and the open workspace's name on one line. The
menu lists the held workspaces with a check on the open one, then a separator, then "manage
workspaces…", with the ellipsis because it opens more. The radio item primitive gains a `check` indicator. The member count, the menu header
and the "switch to" heading are gone.

## Acceptance Criteria

Traces requirements 10, 11 and 13 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 10, 11 and 13.

- [ ] `primitive/dropdown-menu/dropdown-menu-radio-item.svelte` takes `indicator: 'dot' | 'check'`,
      defaulting to `dot`, edited by hand. No other caller changes.
- [ ] A component test finds that the trigger's text is the workspace name only.
- [ ] A component test finds each held workspace as a `menuitemradio`, with `aria-checked="true"` on
      the open one, then a separator, then the manage item. With one workspace held, it finds that
      one checked and the manage item.
- [ ] A component test opens the menu with Enter, moves with the arrow keys, closes with Escape, and
      finds focus back on the trigger.
- [ ] The rail row no longer reads `useMembers`.
- [ ] `workspaceMenu.members`, `switchTo`, `create` and the header strings are removed from both
      locales.

## Relevant areas

- `apps/desktop/src/lib/workspace/component/{menu,rail-row}.svelte`, `workspace/i18n/{en,ar}.ts`
- `packages/design/src/lib/primitive/dropdown-menu/dropdown-menu-radio-item.svelte`

## Constraints

- Primitives are edited by hand, never regenerated ([[rules/frontend]], *Components*).
- The manage item goes to the same place the current "workspaces" item does; the settings area is not
  changed.

## Notes

*Corrected 2026-10-01 by ticket 01 ([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/evidence/prototypes/the-look-of-the-way-in]]): the menu was built but not drawn on real data; ticket 11's walk judges it on the human's organization.*
