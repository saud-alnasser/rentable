---
status: open
blocked-by: [30]
---
# refactor(desktop): a feature's reverse needs are contributions, and the record cycles break

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The human decided on 2026-09-28 that record features depend one way (contract on tenant and unit, payment on contract) and that the reverse needs become contributions (plan, *Architecture*, "A feature's reverse needs are contributions"). `Feature` gains a typed `contributes`, keyed by the kind a contribution serves; `app/` composes every feature's contributions and hands each feature its own through the router context and, where a page needs one, through the route as sections are. Tenant and complex stop importing contract; contract stops importing payment; each thing they read (deletion guards, counts, settlement and the like) arrives as a contribution from the feature that owns it. The layer test lets a declaration file (`feature.ts`, `surface.ts`) name the kinds it contributes to, and the `surface.ts` section `on` literals leave the baseline with that rule.

## Acceptance Criteria

Traces requirements 4 and 5 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 4 and 5.

- [ ] The baseline holds no cycle between contract and tenant, complex or payment, and no `tenant`, `complex` or `contract` module imports a feature that depends on it (criterion 5).
- [ ] A declaration file naming the kind it contributes to is not a violation; a scratch literal kind in a feature's other module still fails the layer test (criterion 2).
- [ ] Every refusal, guard and settlement answers as before; the tests covering them keep their assertions (criterion 19).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/feature/feature.ts`, `src/lib/app/`, `tenant/`, `complex/`, `contract/`, `payment/` routers, hosts and queries

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency baseline in the same commit.
