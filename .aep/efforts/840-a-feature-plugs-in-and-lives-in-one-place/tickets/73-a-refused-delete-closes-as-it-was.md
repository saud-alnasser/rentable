---
status: resolved
---
# fix(design): a refused delete closes as it was

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Found by the human on the running app, 2026-09-30: a tenant's delete that a contract refuses says so, and pressing close showed the delete form (no record named, "this cannot be undone", a delete control) while the dialog left. Every host closes its dialog by forgetting the record it asked about, so `record` and `blockers` empty in the same moment `open` goes false, and the dialog, still on screen for its closing, is redrawn from them. The fault predates the effort (`main` has the same props and host logic) and reaches every delete and confirmation. The design package's `heldWhileOpen` reads what a confirmation shows afresh only while it is open and keeps the last of it after; `delete-dialog.svelte` and `confirm-dialog.svelte` both read through it. Fixed here because it blocks the running-app checks; a patch changeset rides with it.

## Acceptance Criteria

Traces requirement 19 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]].

- [x] A refused delete keeps saying what refuses it until it is gone. Verified on the running app over the webview's debugging port: Abe Mohr's delete (one contract) was opened, closed, and the dialog sampled every 25 ms: before the fix it passed through `Delete | this record | this cannot be undone. | cancel | delete`, after it only the refusal and then nothing.
- [x] What a confirmation shows is held while it closes and read afresh when it opens again. Verified: `tests/confirmation.test.ts` "a closing surface keeps showing what it asked, whatever its caller forgets".
- [x] The integration gate passes on this commit. Verified: the design package's node tests `pass 159`, vitest `114 passed`, `svelte-check` 0 errors 0 warnings, eslint and prettier clean on the changed files.

## Relevant areas

- `packages/design/src/lib/confirmation.ts`, `packages/design/src/lib/block/{delete,confirm}-dialog.svelte`

## Constraints

- One commit, and it passes the integration gate alone ([[rules/version-control]]).
