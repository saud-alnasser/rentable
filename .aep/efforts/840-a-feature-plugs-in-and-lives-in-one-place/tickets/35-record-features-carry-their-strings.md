---
status: open
blocked-by: [21]
---
# refactor(desktop): the record features carry their own strings

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Each record feature's namespace and its `common.refusals.<feature>` move to `<feature>/i18n/en.ts` and `ar.ts`, composed back at the same key path in `i18n/en/index.ts` and `i18n/ar/index.ts` with `.js` import specifiers (plan, *Integration*).

## Acceptance Criteria

Traces requirement 8 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 8.

- [ ] `i18n-types.ts` regenerates identical (criterion 8).
- [ ] A key removed from one locale's piece fails `pnpm check` (criterion 8).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/i18n/`, `.typesafe-i18n.json`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- A locale piece imports nothing but types; the generator transpiles it.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
