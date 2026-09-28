---
status: resolved
blocked-by: [27]
---
# refactor(desktop): navigation is read from surfaces

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`layout/navigation.ts` (`PAGE_ROUTES`, `TRAIL_PLACES`, `PLACE_KINDS`), `layout/destination.ts` and `breadcrumb.svelte`'s labels are built from each surface's `places`.

## Acceptance Criteria

Traces requirements 1 and 2 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 1 and 2.

- [x] None of the four names a feature (criterion 2). Verified: a search of `layout/navigation.ts`, `layout/destination.ts` and `layout/component/breadcrumb.svelte` for any feature name or a `'/x` route literal prints nothing; the pages come from each feature's `feature.ts` `pages` (Node-loadable) and the names and icons from each surface's `places`, listed in order in `app/surfaces.ts`; the baseline lost the five `layout/destination.ts` and `layout/navigation.ts` feature lines.
- [x] The navigation tests keep their assertions. Verified: `layout/tests/navigation.test.ts` has no diff and passes with the layer test (`pass 20 / fail 0`); a new `places.svelte.test.ts` pins the rail and command menu order and that every trail place has a name.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0.

## Relevant areas

- `src/lib/layout/navigation.ts`, `destination.ts`, `component/breadcrumb.svelte`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
