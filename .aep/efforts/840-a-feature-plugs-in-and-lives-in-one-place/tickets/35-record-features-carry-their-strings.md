---
status: resolved
blocked-by: [21]
---
# refactor(desktop): the record features carry their own strings

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Each record feature's namespace and its `common.refusals.<feature>` move to `<feature>/i18n/en.ts` and `ar.ts`, composed back at the same key path in `i18n/en/index.ts` and `i18n/ar/index.ts` with `.js` import specifiers (plan, *Integration*).

## Acceptance Criteria

Traces requirement 8 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 8.

- [x] `i18n-types.ts` regenerates identical (criterion 8). Verified: `pnpm exec typesafe-i18n --no-watch` regenerates the committed `i18n-types.ts` byte for byte; against HEAD it holds the same lines (`diff` of the two sorted files is empty), with the `contracts.payments` block moved to the end of `contracts` because the index composes `payments` after the contract piece. The orchestrator accepted the reorder: the fully composed `en` and `ar` objects serialised before (HEAD's monolithic files) and after compare equal (`en true ar true`).
- [x] A key removed from one locale's piece fails `pnpm check` (criterion 8). Verified: deleting `semiAnnual` from `contract/i18n/ar.ts` made `pnpm check` print `ERROR src/lib/contract/i18n/ar.ts 73:2 Property 'semiAnnual' is missing`; restored. Each piece `satisfies` its slice of the generated types.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0. The layer test counts a locale index reading its own locale's piece as no edge (accepted: the plan puts the composition in `i18n/`).

## Relevant areas

- `src/lib/i18n/`, `.typesafe-i18n.json`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- A locale piece imports nothing but types; the generator transpiles it.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
