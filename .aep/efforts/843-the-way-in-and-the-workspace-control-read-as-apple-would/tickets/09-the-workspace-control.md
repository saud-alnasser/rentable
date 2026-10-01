---
status: resolved
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

- [x] `primitive/dropdown-menu/dropdown-menu-radio-item.svelte` takes `indicator: 'dot' | 'check'`,
      defaulting to `dot`, edited by hand. No other caller changes. *Verified: `npx vitest run
      src/lib/primitive/dropdown-menu` in `packages/design` printed 2 passed (the default draws the dot,
      `check` draws the check); a grep for `RadioItem` outside the primitive finds only the workspace
      menu.*
- [x] A component test finds that the trigger's text is the workspace name only. *Verified:
      `workspace/tests/menu.svelte.test.ts`, "the trigger names the open workspace and nothing else",
      reads the trimmed text `North Properties`; the file printed 8 passed.*
- [x] A component test finds each held workspace as a `menuitemradio`, with `aria-checked="true"` on
      the open one, then a separator, then the manage item. With one workspace held, it finds that
      one checked and the manage item. *Verified: the same file finds the outline
      `North Properties (checked) · South Properties · | · manage` with `aria-checked` `true, false`, and
      `North Properties (checked) · | · manage` for one workspace held.*
- [x] A component test opens the menu with Enter, moves with the arrow keys, closes with Escape, and
      finds focus back on the trigger. *Verified: the same file's keyboard test presses Enter, ArrowDown
      twice and Escape, and finds the menu gone and focus on the trigger.*
- [x] The rail row no longer reads `useMembers`. *Verified: `grep -n "useMembers\|memberCount"
      workspace/component/rail-row.svelte` printed nothing and exited 1; the contribution itself was
      removed, the rail row being its only reader.*
- [x] `workspaceMenu.switchTo`, which only the menu read, is removed from both locales; `members` and
      `create` stay, because the settings area's workspace directory and dialog read them. *Verified: a
      grep finds no `switchTo` in either locale or `i18n-types.ts`; `members` and `create` remain at
      `workspaceMenu` in `en.ts` and `ar.ts`. The header had no string of its own.*

## Relevant areas

- `apps/desktop/src/lib/workspace/component/{menu,rail-row}.svelte`, `workspace/i18n/{en,ar}.ts`
- `packages/design/src/lib/primitive/dropdown-menu/dropdown-menu-radio-item.svelte`

## Constraints

- Primitives are edited by hand, never regenerated ([[rules/frontend]], *Components*).
- The manage item goes to the same place the current "workspaces" item does; the settings area is not
  changed.

## Notes

*Corrected 2026-10-01 by ticket 01 ([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/evidence/prototypes/the-look-of-the-way-in]]): the menu was built but not drawn on real data; ticket 11's walk judges it on the human's organization.*

*Corrected 2026-10-01 while building: the plan's locale row called `workspaceMenu.members` and
`create` unused, but the settings area's workspace directory and dialog read both, and this ticket
leaves the settings area alone. Criterion 6 now removes only the string the menu alone read. The
spec asks for no string's removal, so no requirement narrows.*
