---
status: resolved
blocked-by: [22]
---
# refactor(desktop): settings holds only settings

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`settings/query.ts` splits: sync state to `sync/`, workspace rename and earlier records to `workspace/`, updates and restart to `update/`; its nine raw `createMutation` become `declareMutation`; the shell's sidebar reads sync state from `sync/`.

## Acceptance Criteria

Traces requirements 7 and 13 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 7 and 13.

- [x] `settings/query.ts` holds only settings, and no raw `createMutation` remains outside `mutation/` (criteria 7 and 13). Verified: `settings/query.ts` exports only `keys`, `useFetchSettings`, `useSetEndingSoonNoticeDays` and `useSetAppearance`; sync state is in `sync/query.ts` (key value unchanged), updates and restart in `update/query.ts`, the workspace rename and settling older records in `workspace/query.ts`. A search of `apps/desktop/src` outside `src/lib/mutation/` and tests for `createMutation(` prints nothing: all 40 raw calls (8 settings, 32 organization) are declared through new `declareMutation` options that default to the old behaviour.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree, after merging `app-database-records.svelte` with ticket 26's `$lib/transfer` import and pruning 109 stale baseline lines: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0, validate 0. Test edits: the mark test spies on `toRefusalText` (its assertion unchanged), two mocks point at `$lib/sync/query`, one mock stubs `createQuery`, and new cases cover each declaration option.

## Relevant areas

- `src/lib/settings/query.ts`, `src/lib/layout/component/sidebar.svelte:15`, `src/lib/workspace/earlier.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
