---
status: resolved
---
# fix(desktop): a complex is deleted once, and asked about on what it has now

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

What the human found on the running app on 2026-09-30, and what the correctness review of ticket 74 found:
- **"toasts appear for all":** a confirmed delete ran twice. The complex's own write refetched the deletion plan while the dialog was still up. The complex was gone, so the plan said no units go, and a delete with none runs at once: the host issued a second `complex.delete` behind the dialog, and a second announcement with no undo. The host no longer runs a delete for the complex whose confirmed delete is in flight.
- **A stale plan skipped the question:** the plan is cached, and a workspace write only marks it stale. Read again, it answers with what it held before while it refetches, so a complex that had come to have units could be deleted at once. The host now waits on the refetch, not only on the first fetch.
- **Undo and redo lose no unit:** undoing a creation deletes the complex with whatever units it has by then, and redoing it puts back exactly those rows. A redo of a delete records what it took, so the next undo puts that back, a unit added in between included.

## Acceptance Criteria

Traces requirement and criterion 22 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]].

- [x] A confirmed delete of a complex with units issues one delete and one announcement. Verified: `design/tests/delete-hosts.svelte.test.ts`, with the plan moving to "gone" while the delete is in flight, holds exactly one delete, and fails with the guard removed. On the running app, "ZZ check B" (two units) was deleted, undone and deleted again from its card's menu: each time one `complex.delete` call and one toast with undo, and undo brought it back with both units.
- [x] A plan being refetched neither runs a delete nor asks. Verified: the host test "a complex whose plan is being fetched again waits, and deletes nothing" fails before the fix and passes after; on the running app, the delete after an undo asked, naming its 2 units.
- [x] Undo and redo of a creation, and redo then undo of a deletion, keep every unit. Verified: `design/tests/delete-and-confirm.test.ts` "takes back and puts back a unit added after a complex was deleted and restored" and "undoes a creation whole, and redoing it brings back every unit it took" fail before the fix and pass after.
- [x] The integration gate passes on this commit. Verified: in the run's tree `pnpm check` 0, `eslint .` 0, `prettier --check .` 0, `turbo run test --concurrency=1` 0 (desktop `pass 1433`, design `pass 159`, permission `pass 23`, `fail 0` each), `build:web` 0.

## Relevant areas

- `src/lib/complex/component/host.svelte`, `src/lib/complex/query.ts`, `src/lib/design/tests/`

## Constraints

- One commit, and it passes the integration gate alone ([[rules/version-control]]).
