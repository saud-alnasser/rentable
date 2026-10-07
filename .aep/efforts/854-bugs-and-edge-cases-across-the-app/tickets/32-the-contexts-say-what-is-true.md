---
status: resolved
blocked-by: [27, 28, 29, 30, 31]
---

# docs(desktop): the contexts and rules say what the effort made true

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Appended by converge round 1 (2026-10-07).

## Outcome

Every context, rule and release note this effort touched states what is now true, and the two criterion tests that were weak check what they claim.

## Acceptance Criteria

Traces requirements 15, 17, 24, 25 and 30, and criteria 24 and 25.

- [x] [[contexts/desktop/contract]] says a terminated contract locks the contract and its received payments while its refunds are recorded, edited and deleted directly (the lines on termination and on a file adding payments to a held terminated contract), and that the workspace file writes a refund as a negative amount with its method, reference and note.
- [x] [[contexts/desktop/remote-sync]] says the opening downgrades to a read lock before its first pull and that queries run on held connections; [[contexts/desktop/persistence]] states the persisted-record convention (`.bak` as the last good copy, `.corrupt-<ms>` set aside, a missing primary restored from its copy, a locked file named and the app stopped, synced before the rename); [[rules/module-layout]] records `settings/update-download.svelte.ts` among its departures.
- [x] `api/tests/undo.test.ts` runs the undo of a complex created with no units as a member without the unit-deletion permission and sees it go through; a test undoes a refund on a terminated contract through `applyUndo` and sees it removed.
- [x] The `.changeset/` entries this effort added read as one set of release notes: each sits in the commit of the change it describes, no two describe the same change, the voucher entry is a minor, and no entry describes a file-format internal.

## Relevant areas

- `.aep/contexts/desktop/{contract,remote-sync,persistence}.md`
- `.aep/rules/module-layout.md`
- `apps/desktop/src/lib/api/tests/undo.test.ts`
- `.changeset/`

## Constraints

- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
