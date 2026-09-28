---
status: resolved
blocked-by: [01]
---
# chore(desktop): dead frontend code and stale configuration are removed

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`platform/database/hosted.ts` and its test leave, with `@tursodatabase/sync` from the desktop's `package.json` if nothing else imports it. The four dead exports go. The stale `.gitignore` entries, the control-plane history in `turbo.json` and "local or hosted" in `packages/workspace-migrations` go. [[rules/api-layer]] *One database client type* is corrected to count two callers of `createDatabase`.

## Acceptance Criteria

Traces requirement 16 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 16.

- [x] `hosted.ts`, `tests/hosted.test.ts`, `useFetchComplexes`, `isWithinUtcRange`, `listenForWorkspaceSyncResults`, `getWorkspaceFromSyncState` are gone (criterion 16). Verified: `git grep` for `hosted.ts`, `useFetchComplexes`, `isWithinUtcRange`, `listenForWorkspaceSyncResults`, `getWorkspaceFromSyncState` outside `.aep/efforts` prints nothing; `@tursodatabase/sync` stays, since `apps/desktop/scripts/database.ts` imports it.
- [x] `pnpm dlx knip` run once over `apps/desktop` reports no unused file or dependency this ticket leaves; its output is quoted in the commit body (criterion 16). Verified: `pnpm dlx knip --workspace apps/desktop` (knip 6.38.0) reported one unused file (`prototype/switcher.svelte`), one unused devDependency (`@tauri-apps/cli`), 51 unused exports and 33 unused types, none left by this ticket; quoted in the commit body.
- [x] [[rules/api-layer]] and [[contexts/repository]] no longer describe `hosted.ts`. Verified: a search of `rules/api-layer.md` and `contexts/repository.md` for `hosted.ts` finds nothing; *One database client type* counts two callers of `createDatabase`. Gate in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0, validate 0.

## Relevant areas

- `src/lib/platform/database/`, `src/lib/complex/query.ts`, `src/lib/api/date.ts`, `src/lib/sync/`
- root `.gitignore`, `turbo.json`, `packages/workspace-migrations/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- Leave the Rust engine's `turso` crate alone; only the web-layer package goes.
