---
status: open
blocked-by: [48]
---

# feat(desktop): a workspace's people are in or out, with a lock to read-only

## Outcome

Ticket 48 made a member's workspaces switches, in or out, with an owner-only lock to read-only.
The dialog opened from a workspace's card, which lists who holds it, still offers full access,
read-only and no access per member: the same choice from the workspace's side, in the words the
human's call retired. After this it draws each member as the member's card draws each workspace,
as [[efforts/838-permissions-are-a-role-and-an-override/plan]], *A workspace is in or out, with a lock*, gives it.

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [ ] `access-dialog.svelte` draws each member as a switch, in or out, with the owner-only lock
      beneath one who is in, the same refusals at the same controls, and no level choice; it shares
      the member card's row, not a second copy.
- [ ] `rules/interface` drops the exception ticket 48 recorded for this dialog.
- [ ] Component tests in English and Arabic; `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `src/lib/organization/component/access-dialog.svelte`, `member-workspaces.svelte`,
  `src/lib/i18n`, `.aep/rules/interface.md`
