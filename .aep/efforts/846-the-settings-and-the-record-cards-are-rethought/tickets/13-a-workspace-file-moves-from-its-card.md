---
status: open
blocked-by: [07, 12]
---

# feat(desktop): a workspace's file moves from its card

Blocked by: 07, 12

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Every workspace card offers *export* and *import* for that workspace, gated by the reader's standing in it; the host runs them; the block below the cards is gone; the earlier-records callout stands above the cards, naming the workspace it fills. [[rules/interface]]'s *Export and import* says what was built.

## Acceptance Criteria

Traces requirements 15, 17 and 22, and criteria 15, 17 and 22.

- [ ] A card not open on this machine offers both acts; a read-only grant refuses import on that card while the open card's is offered.
- [ ] Export writes the card's workspace through the save dialog and reveals it; the import dialog names the workspace and confirms with its id.
- [ ] An unreachable Turso refuses an export of a workspace that is not open with the sentence from ticket 11, and nothing is written.
- [ ] No transfer block is drawn below the cards; `transfer.svelte` is deleted.
- [ ] The callout stands above the cards, names the open workspace, passes its id, and with nothing open keeps its line and no act.
- [ ] The palette offers both acts through `organization/palette.ts`; `act/tests/act.test.ts` passes.
- [ ] *Export and import* says a workspace's file moves from its card.

## Relevant areas

- `apps/desktop/src/lib/organization/workspace/{acts.ts,component/host.svelte,component/directory.svelte,component/app-database-records.svelte,component/transfer.svelte}`
- `apps/desktop/src/lib/organization/host.svelte.ts`, `apps/desktop/src/lib/transfer/component/import-dialog.svelte`, `apps/desktop/src/lib/workspace/query.ts`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
- The by-hand check of a never-held workspace is ticket 20's.
