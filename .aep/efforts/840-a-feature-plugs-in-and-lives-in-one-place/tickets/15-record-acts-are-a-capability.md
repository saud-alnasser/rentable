---
status: resolved
blocked-by: [08]
---
# refactor(desktop): record acts are a capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`design/acts.ts` becomes `src/lib/act/` with an `index.ts`: the act shape and its projections onto the card, the page and the palette.

## Acceptance Criteria

Traces requirement 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 20.

- [x] Every feature's `acts.ts` imports `$lib/act` (criterion 20). Verified: each feature's `acts.ts` (tenant, complex, complex/unit, contract, payment, organization) imports from `'$lib/act'` (one match each); `grep -rn design/acts apps/desktop/src .aep/rules` prints nothing.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree, after resolving `tenant/acts.ts` against ticket 19 (keeping `$lib/act` and tenant's own `Tenant`): check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0; no assertion line changed in any test.

## Relevant areas

- `src/lib/design/acts.ts` and its importers

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
