---
status: resolved
blocked-by: [13, 15]
---
# refactor(desktop): one composition root lists every feature

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`src/lib/feature/` holds the contract (`defineFeature`, `routersOf`; plan, *Interfaces*); every feature and capability with a router gets a `feature.ts`; `src/lib/app/features.ts` lists them; `app/router.ts` builds `appRouter` from the list and `app/caller.ts` moves from `api/`. The router tree is not yet flattened: this ticket keeps today's paths.

## Acceptance Criteria

Traces requirements 2 and 3 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 2 and 3.

- [x] `appRouter` is `router(routersOf(features))` and the client types are unchanged (`pnpm check`) (criterion 3). Verified: `app/router.ts:13` reads `export const appRouter = router(routersOf(features));` with `routersOf` in `feature/feature.ts`; `pnpm check` in the run's tree exited 0 with no procedure call site touched; `app/tests/router.test.ts` asserts at the type level that the composed record equals the old one. Features reach procedures through `$lib/api/caller`, typed by `import type { AppRouter }`, and `app/caller.ts` binds the runtime router as the root layout's first import (orchestrator's call, so nothing below the composition layer imports `app/`; the baseline has no `-> app` line).
- [x] Every router is `export default` (criterion 3). Verified: every concept `router.ts` (ten) has `export default`; the one other `router.ts` is the root `app/router.ts`; no `export const ...Router = router(` remains in a concept.
- [x] The layer map gains `app` (composition) and `feature` (foundation). Verified: `LAYERS` in `layers.test.ts` holds `app: 'composition'` and `feature: 'foundation'`.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0; test changes are import and mock paths for moved files, and `boundaries.test.ts` scans `app/` as it scanned `api/`.

## Relevant areas

- `src/lib/api/router.ts`, `src/lib/api/app.ts`, `src/lib/api/caller.ts`, every `*/router.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
