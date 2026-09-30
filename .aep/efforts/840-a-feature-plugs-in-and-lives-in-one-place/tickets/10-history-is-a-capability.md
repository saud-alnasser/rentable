---
status: resolved
blocked-by: [08]
---
# refactor(desktop): history is a capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`history/` becomes a capability: `HistoryConcept` derives from `RECORD_KINDS`, the stored `concept` enum in `platform/database/schema.ts` is built from the same list with the same five values, and `index.ts` exposes the entry type, `historyKeys` and what a mutation hands it. `design/mutation.ts` and `design/inverse.ts` import `$lib/history` only.

## Acceptance Criteria

Traces requirements 1 and 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 1 and 20.

- [x] `HistoryConcept` is derived and declared nowhere else; the schema enum is derived (criterion 1). Verified: `history/history.ts:21` declares `export type HistoryConcept = RecordKind` (from `$lib/permission`, itself `(typeof RECORD_KINDS)[number]`); a search of `src/lib` finds no other declaration. `schema.ts` builds the drizzle `concept` enum and the zod `HistorySchema.concept` from one typed cast of `RECORD_KINDS`. The stored strings are the same five; the list order is the permission package's (`complex, unit, tenant, contract, payment`), which is stored nowhere (the column is `text NOT NULL`, no CHECK), and no code iterates the enum's values (accepted by the orchestrator).
- [x] `drizzle-kit generate` produces no migration (criterion 19). Verified: `pnpm exec drizzle-kit generate` in apps/desktop, after integrating over ticket 19, printed `No schema changes, nothing to migrate`; no new file.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0; no assertion line changed in any test.

## Relevant areas

- `src/lib/history/`, `src/lib/platform/database/schema.ts:221-240`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The stored values must not change spelling or order (spec, *Constraints*).
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
