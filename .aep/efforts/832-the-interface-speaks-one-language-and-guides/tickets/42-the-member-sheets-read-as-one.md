---
status: open
---

# fix(organization): the new member sheet reads like the edit sheet, and every segment keeps its padding

## Outcome

A segmented control's segments keep their side padding however narrow the row, so "administrator"
never touches its edges. The sheet that adds a member is laid out the way the sheet that edits one
is: the same sections, legends, order and spacing for the role, the acts and the workspaces, so the
two read as one surface in two moments. Found by the human in the running app on 2026-09-25.

## Acceptance Criteria

Traces requirements 6 and 15 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criteria 6 and 15.

- [ ] A toggle-group item never shrinks below its content and padding; the member sheet's role
      control shows "administrator" with its padding in both locales. Component test on the item's
      classes, and the orchestrator's screenshot of both sheets.
- [ ] `account-form.svelte` (new member) uses the member sheet's structure for the role, the acts
      and the workspaces: the same section blocks, legends, order and control shapes, sharing the
      pieces rather than copying them where they can be shared. Existing gates and tests hold.
- [ ] `[[rules/interface]]` *Form surface* or the members' section says the add and edit sheets
      share one layout.

## Relevant areas

- `apps/desktop/src/lib/organization/component/account-form.svelte`, `member-sheet.svelte`,
  `packages/design/src/lib/primitive/toggle-group/*`

## Constraints

- Owner-only and permission-gated choices keep exactly today's gates.
