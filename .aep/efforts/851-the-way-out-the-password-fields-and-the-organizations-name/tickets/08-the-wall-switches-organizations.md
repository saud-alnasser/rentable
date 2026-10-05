---
status: open
blocked-by: [07]
---

# feat(desktop): the wall switches between organizations

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]], and [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/plan]] (*The switcher*, *Interfaces*).

## Outcome

With no organization the welcome is today's. With one or more, the wall and the no-workspace screen show the switcher above their content: the chosen organization's tile and name, a hover, and on a click a dropdown of every held organization with the chosen one checked and an x on each row, then "add organization" with a plus. Choosing one shows its wall; an x opens the remove confirm for that row; adding goes through set up or join and comes back to the selection. The wall's foot control carries language and appearance alone.

## Acceptance Criteria

Traces requirements 1 to 7 and 15, and criteria 1 (the component half), 2, 3, 4, 5 (the component half), 6, 7 and 15.

- [ ] `OrganizationState` carries `organizations` and `selected` in Rust and TypeScript, `organization` is gone, and every fixture and test the plan's evidence lists builds the new shape; `admission.ts` reads `organizations.length`; `startup/wall.ts` gains `select(id)` and `remove(id)` guarded by `isSigningIn` and `isCreating`.
- [ ] `organization/component/switcher.svelte` as the plan describes; component tests for criterion 3 (opens on a click, both organizations, check on the chosen, an x per row that opens the confirm for that row and does not switch, "add organization" last, choosing the other shows its wall).
- [ ] The wall draws the switcher at the top of its content, its title is "sign in" and the organization's name appears once (criterion 2); the welcome with no organization has no switcher (criterion 1).
- [ ] The no-workspace screen draws the switcher for owner and member (criterion 7); its select and add sign out first, removing another organization does not; `startupScreen` lets it reach the first run and the join.
- [ ] Adding returns to the selected organization's wall when abandoned and selects the new one when finished (criterion 4); the switcher is disabled while signing in and while creating (criterion 6).
- [ ] The remove confirm is `DisconnectDialog` named for the row's organization; its Turso clause appears only where that organization holds this machine's consent (criterion 5).
- [ ] `way-in-preferences.svelte` loses `extras`; its test asserts language and appearance only (criterion 15).
- [ ] Every new string in English and Arabic; a changeset.

## Relevant areas

- `apps/desktop/src/lib/startup/{wall.ts,machine.ts,screen.ts,snapshot.ts,component/root.svelte,component/sign-in.svelte,component/no-workspace.svelte}`
- `apps/desktop/src/lib/sync/admission.ts`, `src/lib/organization/{host.ts,component/disconnect-dialog.svelte}`
- `apps/desktop/src/lib/workspace/component/menu.svelte` for the dropdown's anatomy; `src/lib/settings/component/way-in-preferences.svelte`
- `packages/design/src/lib/block/way-in-surface.svelte`

## Constraints

- Choose the dropdown and the tile per [[contexts/desktop/components]]; follow Apple's HIG first, then [[rules/interface]].
- The selection lives in the record (ticket 07), not in component state.
- Correct the code comments naming one organization per machine in the files this touches.
