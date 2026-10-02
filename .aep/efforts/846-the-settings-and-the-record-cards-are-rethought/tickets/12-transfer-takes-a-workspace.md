---
status: open
blocked-by: [11]
---

# feat(desktop): the transfer procedures take a workspace

Blocked by: 11

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

`databaseOf` on the context, `procedure.permittedIn`, and `transfer.get`, `importWhole` and `held` taking `{ workspaceId? }`, as the plan's *Router* and *TypeScript* bullets give them, with contract status computed at read when the workspace is not the open one.

## Acceptance Criteria

Traces requirement 15 and criterion 15 at the router.

- [ ] On two memory workspaces, A open and B with known records: `get({ workspaceId: B })` equals B's file, `get()` A's.
- [ ] `importWhole({ workspaceId: B, ... })` adds to B and leaves A's file unchanged; `held({ workspaceId: B })` answers B's.
- [ ] B read-only refuses import there while A's import passes; a flag pinned off in B alone refuses there; a workspace with no grant is refused.
- [ ] A contract whose stored status is stale in B exports its derived status.
- [ ] `api/tests/flags.test.ts` walks the new declaration; [[rules/api-layer]]'s counts and kinds name it.
- [ ] Every list import, which passes no workspace, is unchanged.

## Relevant areas

- `apps/desktop/src/lib/api/{trpc.ts,context.ts}`, `apps/desktop/src/lib/transfer/router.ts`
- `apps/desktop/src/lib/organization/workspace/{host.ts,tauri.ts}`, `apps/desktop/src/lib/contract/reconcile.ts`
- `apps/desktop/src/lib/transfer/tests/`, `apps/desktop/src/lib/app/tests/`

## Constraints

- No changeset: nothing a person sees changes until ticket 13.
