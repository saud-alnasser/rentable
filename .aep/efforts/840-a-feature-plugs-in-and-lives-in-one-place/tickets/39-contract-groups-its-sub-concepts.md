---
status: resolved
blocked-by: [30]
---
# refactor(desktop): the contract groups its sub-concepts

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Contract's eleven flat helpers group into sub-directories by what they serve; `contract/router.ts` (1,637), `component/form.svelte` (1,087), `contract.ts`, `query.ts` and `component/host.svelte` split along their concerns.

## Acceptance Criteria

Traces requirements 6 and 17 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 6 and 17.

- [x] No file in `contract/` passes 500 lines (criterion 17). Verified: `find src/lib/contract -type f -not -path '*/tests/*' | xargs wc -l`: the largest source files are `component/form.svelte` 496, `query.ts` 485, `router.ts` 435 (and `contract.ts` 422). Three router test pieces pass 500 after splitting with their subject (`tests/router.test.ts` 706, `directory/tests/router.test.ts` 825, `selection/tests/router.test.ts` 580); the criterion is read as spec criterion 17's source files. Sub-concepts: `schedule/`, `renewal/`, `rank/`, `assignment/` (the contract-unit link, avoiding a clash with `$lib/transfer`), `directory/`, `selection/`.
- [x] `contract/tests/router.test.ts` keeps its assertions, split with its subject where it is. Verified: the child's sorted `assert` and `test(` lines across the six router test pieces diff identically against the original `contract/tests/router.test.ts`; 127 tests pass.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, build:web 0, validate 0; `pnpm test` fails one test, `payment/tests/router.test.ts` `a payment's receipt states who paid...`, and fails the same way at the tip without this ticket: `monthsFromNow(-7)` from 2026-09-29 is 29 February, which rolls into March, so the cycle dates move three days. That date dependence predates the effort; every other test passes.

## Relevant areas

- `src/lib/contract/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
