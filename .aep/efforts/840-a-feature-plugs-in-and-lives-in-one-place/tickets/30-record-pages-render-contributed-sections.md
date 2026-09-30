---
status: resolved
blocked-by: [27]
---
# refactor(desktop): record pages render the sections other features contribute

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

A record page renders the sections whose `on` names its kind. Contract contributes the contracts section to tenant, complex and unit pages; payment contributes the ledger to the contract page; history contributes its tab. The seven cross-feature component imports go.

## Acceptance Criteria

Traces requirements 4 and 5 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 4 and 5.

- [x] No record feature (tenant, complex with unit, contract, payment) imports another's `component/` (criterion 4). Verified: a search of each of `tenant/`, `complex/` (with `unit/`), `contract/` and `payment/` (tests aside) for an import of another of them's `component/` prints nothing: contract contributes the tenant and unit contract lists and payment the ledger as sections, history places its tab through `historySection` from `history/ui.ts`, and each route passes `sectionsOn(kind)` from `app/surfaces.ts`. Every page shows the same tabs, order, labels and permission checks; the baseline lost 16 lines and gained the three section `on` literals in `contract/surface.ts` and `payment/surface.ts`, which ticket 62 exempts.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree, after merging `app/surfaces.ts` and `contract/surface.ts` with ticket 28's places: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0, validate 0; tests changed only by the new `sections` prop, the moved import path and `recordId`.

*Narrowed on 2026-09-28 when the plan changed: the cycles with contract survive through domain and query imports, which ticket 62 turns into contributions; the other features' component imports belong to tickets 26, 31, 32 and 37.*

## Relevant areas

- `tenant/component/contracts.svelte`, `complex/unit/component/contracts.svelte`, `contract/component/details.svelte`, `payment/component/details.svelte`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
