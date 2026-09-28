---
status: open
blocked-by: [27]
---
# refactor(desktop): record pages render the sections other features contribute

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

A record page renders the sections whose `on` names its kind. Contract contributes the contracts section to tenant, complex and unit pages; payment contributes the ledger to the contract page; history contributes its tab. The seven cross-feature component imports go.

## Acceptance Criteria

Traces requirements 4 and 5 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 4 and 5.

- [ ] No record feature (tenant, complex with unit, contract, payment) imports another's `component/` (criterion 4).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

*Narrowed on 2026-09-28 when the plan changed: the cycles with contract survive through domain and query imports, which ticket 62 turns into contributions; the other features' component imports belong to tickets 26, 31, 32 and 37.*

## Relevant areas

- `tenant/component/contracts.svelte`, `complex/unit/component/contracts.svelte`, `contract/component/details.svelte`, `payment/component/details.svelte`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
