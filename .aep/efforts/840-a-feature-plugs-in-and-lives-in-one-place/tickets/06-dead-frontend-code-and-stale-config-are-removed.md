---
status: open
blocked-by: [01]
---
# chore(desktop): dead frontend code and stale configuration are removed

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`platform/database/hosted.ts` and its test leave, with `@tursodatabase/sync` from the desktop's `package.json` if nothing else imports it. The four dead exports go. The stale `.gitignore` entries, the control-plane history in `turbo.json` and "local or hosted" in `packages/workspace-migrations` go. [[rules/api-layer]] *One database client type* is corrected to count two callers of `createDatabase`.

## Acceptance Criteria

Traces requirement 16 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 16.

- [ ] `hosted.ts`, `tests/hosted.test.ts`, `useFetchComplexes`, `isWithinUtcRange`, `listenForWorkspaceSyncResults`, `getWorkspaceFromSyncState` are gone (criterion 16).
- [ ] `pnpm dlx knip` run once over `apps/desktop` reports no unused file or dependency this ticket leaves; its output is quoted in the commit body (criterion 16).
- [ ] [[rules/api-layer]] and [[contexts/repository]] no longer describe `hosted.ts`.

## Relevant areas

- `src/lib/platform/database/`, `src/lib/complex/query.ts`, `src/lib/api/date.ts`, `src/lib/sync/`
- root `.gitignore`, `turbo.json`, `packages/workspace-migrations/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- Leave the Rust engine's `turso` crate alone; only the web-layer package goes.
