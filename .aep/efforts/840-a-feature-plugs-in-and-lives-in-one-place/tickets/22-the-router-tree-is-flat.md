---
status: resolved
blocked-by: [21]
---
# refactor(desktop): every router mounts at the root

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`payment` and `dashboard` leave `contract/router.ts`; `api/app.ts` dissolves: `settings` and `organization` mount at the root, `remoteSync` becomes `sync`, the updater becomes the `update` feature, `bootstrap` goes to a `startup` feature, `state.reconcile` becomes `contract.reconcile` (plan, *tRPC paths*). Every caller changes with it.

## Acceptance Criteria

Traces requirement 3 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 3.

- [x] No router mounts another feature's router; `appRouter._def.record`'s keys are the feature names (criterion 3). Verified: the child's search for a `$lib/*/router` import outside tests found only `app/caller.ts -> ./router`; `appRouter._def.record` keys printed `tenant complex contract payment dashboard history workspace organization settings sync update startup` (113 procedures, as before); `app/tests/router.test.ts` asserts each procedure sits one level under its own feature.
- [x] `api/tests/flags.test.ts` walks the new paths and passes. Verified: `api/tests/flags.test.ts` walks `payment.*`, `dashboard.get`, `contract.reconcile` and passes; `contract.reconcile` joins `OPEN_TO_EVERY_MEMBER`, still asserted `procedure.member`.
- [x] Before moving, a grep of diagnostics and `tauri/src/` for a recorded procedure path finds none, and the commit says so. Verified: before moving, the child searched `platform/diagnostics.ts`, every `recordDiagnostic*` call and `tauri/src` including capabilities for a recorded procedure path and found none; the commit says so.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree, after integrating over ticket 27 (one context paragraph merged; five cycle lines added: `app -> dashboard`, `app -> startup`, `app -> update`, `startup -> api`, `update -> api`, the existing cycles through the new homes): check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0, validate 0.

## Relevant areas

- `src/lib/contract/router.ts:47,50`, `src/lib/api/app.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
