---
status: resolved
blocked-by: [33]
---
# refactor(desktop): the four fat routes delegate

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`routes/+layout.svelte`, `routes/organization/new/+page.svelte`, `routes/organization/join/+page.svelte` and `routes/settings/+page.svelte` move their state and mutation wiring into their features, as the entity routes already do; the route tests under `routes/organization/` follow their subject.

## Acceptance Criteria

Traces requirement 17 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 17.

- [x] None of the four holds mutation wiring (criterion 17). Verified: a search of the four routes for `useMutation`, `declareMutation`, `createMutation`, `.mutate(` and `mutateAsync` counts 0 in each; the root layout composes (its first imports `$lib/app/caller`, `cache`, `transfer`, `surfaces` in order, with a comment) and hands the window to `startup/component/root.svelte`; the organization routes render `organization/setup/component/first-run.svelte` and `join.svelte`, and settings renders `settings/component/page.svelte`.
- [x] The dependency test gains the rule that a `routes/` file imports only `$lib/*/component` and `$lib/app`. Verified: `layers.test.ts` has a `route` kind: a `routes/` file imports only `$lib/*/component/...`, `$lib/*/ui`, `$lib/app/...`, `$app/*`, third-party code and types; the child's scratch `routes/scratch/+page.svelte` importing `$lib/tenant/query` failed it with `+ 'routes/scratch/+page.svelte -> tenant/query.ts : route'`; the baseline holds no `route` line.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree, integrated over ticket 53: check 0, eslint 0, vitest `623 passed` (run on its own), build:web 0, validate 0; node tests fail only the date-dependent receipt test. The route tests moved to `organization/setup/tests/` taking props, assertions unchanged.

## Relevant areas

- the four routes

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
