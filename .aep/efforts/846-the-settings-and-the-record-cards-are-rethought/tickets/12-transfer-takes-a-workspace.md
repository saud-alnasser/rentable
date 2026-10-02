---
status: resolved
blocked-by: [11]
---

# feat(desktop): the transfer procedures take a workspace

Blocked by: 11

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

`databaseOf` on the context, `procedure.permittedIn`, and `transfer.get`, `importWhole` and `held` taking `{ workspaceId? }`, as the plan's *Router* and *TypeScript* bullets give them, with contract status computed at read when the workspace is not the open one.

## Acceptance Criteria

Traces requirement 15 and criterion 15 at the router.

- [x] On two memory workspaces, A open and B with known records: `get({ workspaceId: B })` equals B's file, `get()` A's. *Verified: `node --test transfer/tests/router.test.ts api/tests/flags.test.ts` printed pass 34, fail 0; "a workspace that is not open exports its own file" finds `get({workspaceId:'south'})` equal to south's file and `get()` to north's.*
- [x] `importWhole({ workspaceId: B, ... })` adds to B and leaves A's file unchanged; `held({ workspaceId: B })` answers B's. *Verified: the same run: "an import into a workspace that is not open" adds to south, leaves north unchanged, requests no push, and `held({workspaceId:'south'})` answers south's.*
- [x] B read-only refuses import there while A's import passes; a flag pinned off in B alone refuses there; a workspace with no grant is refused. *Verified: the same run: read-only south refuses the import while north's passes; a flag pinned off in south alone refuses there; `west` is refused with `host.noGrant` and nothing is reached.*
- [x] A contract whose stored status is stale in B exports its derived status. *Verified: the same run: "a contract whose stored status went stale" exports `active` while the stored value stays `scheduled`.*
- [x] `api/tests/flags.test.ts` walks the new declaration; [[rules/api-layer]]'s counts and kinds name it. *Verified: the same run includes `flags.test.ts` (11) walking `permittedIn` over the three transfer procedures; rules/api-layer says six ways and recounts 113 procedures (2 `permittedIn`).*
- [x] Every list import, which passes no workspace, is unchanged. *Verified: the list imports call `held()` with no input; the builder's full desktop run printed node 1470/1470 and vitest 674/674, and svelte-check needed no call-site change.*

## Relevant areas

- `apps/desktop/src/lib/api/{trpc.ts,context.ts}`, `apps/desktop/src/lib/transfer/router.ts`
- `apps/desktop/src/lib/organization/workspace/{host.ts,tauri.ts}`, `apps/desktop/src/lib/contract/reconcile.ts`
- `apps/desktop/src/lib/transfer/tests/`, `apps/desktop/src/lib/app/tests/`

## Constraints

- No changeset: nothing a person sees changes until ticket 13.
