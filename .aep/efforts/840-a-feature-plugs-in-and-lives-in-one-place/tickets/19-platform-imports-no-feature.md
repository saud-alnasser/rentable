---
status: open
blocked-by: [08]
---
# refactor(desktop): the platform imports no feature

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The zod schemas in `platform/database/schema.ts` that use tenant's validators move to `tenant/`, so `schema.ts:1` no longer imports `$lib/tenant/tenant`. The tables stay where they are (plan, *Alternatives that lost*).

## Acceptance Criteria

Traces requirement 5 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 5.

- [ ] `platform/` imports no feature; the baseline loses `platform` to `tenant` (criterion 5).
- [ ] `drizzle-kit generate` produces no migration (criterion 19).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/platform/database/schema.ts`, `src/lib/tenant/tenant.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
