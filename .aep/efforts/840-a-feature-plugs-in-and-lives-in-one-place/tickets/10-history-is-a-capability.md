---
status: open
blocked-by: [08]
---
# refactor(desktop): history is a capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`history/` becomes a capability: `HistoryConcept` derives from `RECORD_KINDS`, the stored `concept` enum in `platform/database/schema.ts` is built from the same list with the same five values, and `index.ts` exposes the entry type, `historyKeys` and what a mutation hands it. `design/mutation.ts` and `design/inverse.ts` import `$lib/history` only.

## Acceptance Criteria

Traces requirements 1 and 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 1 and 20.

- [ ] `HistoryConcept` is derived and declared nowhere else; the schema enum is derived (criterion 1).
- [ ] `drizzle-kit generate` produces no migration (criterion 19).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/history/`, `src/lib/platform/database/schema.ts:221-240`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The stored values must not change spelling or order (spec, *Constraints*).
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
