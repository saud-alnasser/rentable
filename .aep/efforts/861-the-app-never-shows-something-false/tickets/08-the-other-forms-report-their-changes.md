---
status: open
blocked-by: [06]
---

# fix(desktop): the forms without a schema report their changes

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Technical Approach, step 6*).

## Outcome

The thirteen forms on the surface that are not superforms pass `dirty` from a comparison of their editable state with a snapshot taken at open, through one `form/dirty.ts` helper; the previews and the upgrade sheet pass nothing.

## Acceptance Criteria

Traces requirement 10 and criterion 10 (the other forms).

- [ ] `form/dirty.ts` compares a `$state.snapshot` taken at open with the current state; a unit test covers equal, changed, and changed back.
- [ ] The member sheet, the role editor, the workspace add and permissions sheets, the link form, offer and accept ownership, delete organization and change password pass `dirty`; the made link, the reminder preview, the print preview and the upgrade sheet pass none.
- [ ] A component test for a sheet of switches and one for a dialog of fields each ask after a change and close at once without one.

## Relevant areas

- apps/desktop/src/lib/form/dirty.ts (new)
- apps/desktop/src/lib/organization/member/component/sheet.svelte, organization/role/component/editor.svelte, organization/workspace/component/add-sheet.svelte, organization/workspace/component/permissions-sheet.svelte
- the link, ownership, delete-organization and change-password components under apps/desktop/src/lib/organization/
- the upgrade sheet under apps/desktop/src/lib/update/, the print preview under print/, the reminder preview under contract/

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
