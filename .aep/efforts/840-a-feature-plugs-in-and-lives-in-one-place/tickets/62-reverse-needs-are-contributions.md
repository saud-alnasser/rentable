---
status: resolved
blocked-by: [30]
---
# refactor(desktop): a feature's reverse needs are contributions, and the record cycles break

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The human decided on 2026-09-28 that record features depend one way (contract on tenant and unit, payment on contract) and that the reverse needs become contributions (plan, *Architecture*, "A feature's reverse needs are contributions"). `Feature` gains a typed `contributes`, keyed by the kind a contribution serves; `app/` composes every feature's contributions and hands each feature its own through the router context and, where a page needs one, through the route as sections are. Tenant and complex stop importing contract; contract stops importing payment; each thing they read (deletion guards, counts, settlement and the like) arrives as a contribution from the feature that owns it. The layer test lets a declaration file (`feature.ts`, `surface.ts`) name the kinds it contributes to, and the `surface.ts` section `on` literals leave the baseline with that rule.

## Acceptance Criteria

Traces requirements 4 and 5 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 4 and 5.

- [x] No `tenant`, `complex` or `contract` module imports a feature that depends on it, and the baseline loses the reverse edges `tenant -> contract`, `complex -> contract`, `complex -> payment` and `contract -> payment` (criterion 5). Verified: a search of `tenant/` and `complex/` for any import from `$lib/contract` or `$lib/payment`, and of `contract/` for `$lib/payment` (type imports included, tests aside), prints nothing; the baseline holds no `tenant -> contract`, `complex -> contract`, `complex -> payment` or `contract -> payment` line, and after integrating over 29 every `payment -> *` cycle line left too. Each need is a type the needing feature declares; the dependent feature contributes it in `feature.ts` (routers read `ctx.contributions`) or `surface.ts` (the window reads `contributionsTo(kind)`), merged in `app/` and typed so a missing member fails the check.
- [x] A declaration file naming the kind it contributes to is not a violation; a scratch literal kind in a feature's other module still fails the layer test (criterion 2). Verified: the child's scratch `'tenant'` in `contract/reconcile.ts` failed the layer test with `+ 'contract/reconcile.ts -> tenant : literal'`; declaration files naming the kinds they contribute to pass.
- [x] Every refusal, guard and settlement answers as before; the tests covering them keep their assertions (criterion 19). Verified: `pnpm test` passes in the run's tree with no assertion changed; the paid-amount test moved with `getPaidAmount` into `contract.ts`, and three host tests import `$lib/app/surfaces` so the contributions are provided.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree, after merging `app/surfaces.ts`, `feature/surface.ts` and `contract/surface.ts` with ticket 29 and pruning 17 stale payment cycle lines: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0, validate 0.

*Narrowed on 2026-09-29 at integration: the forward edges (`contract -> tenant`, `contract -> complex`, `payment -> contract`) still lie on longer cycles through `workspace`, `settings`, `dashboard`, `organization` and `layout`, which tickets 31, 32 and 37 unwind; converge checks criterion 5 over the whole tree.*

## Relevant areas

- `src/lib/feature/feature.ts`, `src/lib/app/`, `tenant/`, `complex/`, `contract/`, `payment/` routers, hosts and queries

## Constraints

- Behaviour does not change (requirement 19).
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency baseline in the same commit.
