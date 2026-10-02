---
status: resolved
blocked-by: [07, 12]
---

# feat(desktop): a workspace's file moves from its card

Blocked by: 07, 12

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Every workspace card offers *export* and *import* for that workspace, gated by the reader's standing in it; the host runs them; the block below the cards is gone; the earlier-records callout stands above the cards, naming the workspace it fills. [[rules/interface]]'s *Export and import* says what was built.

## Acceptance Criteria

Traces requirements 15, 17 and 22, and criteria 15, 17 and 22.

- [x] A card not open on this machine offers both acts; a read-only grant refuses import on that card while the open card's is offered. *Verified: `vitest run organization/workspace palette/tests/organization.svelte.test.ts` printed 4 files, 70 passed: a non-open card offers export and import, and a read-only grant there refuses its import while the open card's is offered.*
- [x] Export writes the card's workspace through the save dialog and reveals it; the import dialog names the workspace and confirms with its id. *Verified: the same run: export goes through the save dialog, `transfer.get({ workspaceId })` and reveal; the import dialog is titled with the workspace and confirms with its id.*
- [x] An unreachable Turso refuses an export of a workspace that is not open with the sentence from ticket 11, and nothing is written. *Verified: the same run: with `get` rejecting as unreachable the error is shown and neither the write nor the reveal is called (the sentence itself is ticket 11's, pinned by its Rust test).*
- [x] No transfer block is drawn below the cards; `transfer.svelte` is deleted. *Verified: the same run finds no block below the cards; `ls organization/workspace/component | grep -c ^transfer` printed 0.*
- [x] The callout stands above the cards, names the open workspace, passes its id, and with nothing open keeps its line and no act. *Verified: the same run: the callout sits above the cards, names the open workspace, passes `ws-1`, and with nothing open shows its line and no act.*
- [x] The palette offers both acts through `organization/palette.ts`; `act/tests/act.test.ts` passes. *Verified: `node --test src/lib/act/tests/act.test.ts` printed pass 91, fail 0; the palette test in the run above offers both and runs them on a non-open workspace.*
- [x] *Export and import* says a workspace's file moves from its card. *Verified: read rules/interface: *Export and import* says a workspace's file moves from its card, by any route, refused by the reader's standing in that workspace, and over Turso when not open.*

## Relevant areas

- `apps/desktop/src/lib/organization/workspace/{acts.ts,component/host.svelte,component/directory.svelte,component/app-database-records.svelte,component/transfer.svelte}`
- `apps/desktop/src/lib/organization/host.svelte.ts`, `apps/desktop/src/lib/transfer/component/import-dialog.svelte`, `apps/desktop/src/lib/workspace/query.ts`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
- The by-hand check of a never-held workspace is ticket 20's.
