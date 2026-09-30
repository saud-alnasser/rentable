---
status: resolved
blocked-by: [01]
---
# refactor(desktop): permission is a capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`workspace/permission.ts` becomes `src/lib/permission/` with an `index.ts`, the first capability. `RecordKind` and the view, export and import flag tables derive from `@rentable/workspace-permission`'s `RECORD_KINDS` and `FAMILIES` instead of restating them. Its 28 importers import `$lib/permission`. The dependency test's layer map gains `permission` as a capability.

## Acceptance Criteria

Traces requirements 1, 7 and 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 1, 7 and 20.

- [x] `RecordKind` is `(typeof RECORD_KINDS)[number]` and declared nowhere else in `src/lib` (criterion 1). Verified: `permission/permission.ts:35` declares `export type RecordKind = (typeof RECORD_KINDS)[number]`; a search of `src/lib` for a `RecordKind` declaration finds only that line (other hits import it, and `organization/role.ts` re-exports the package's own type). The derived `EXPORT_FLAGS` and `IMPORT_FLAGS` are arrays of the same union rather than fixed tuples (values and order identical; no consumer reads the tuple shape; accepted by the orchestrator).
- [x] Nothing imports `$lib/workspace/permission`; `design/` imports `$lib/permission` (criteria 7 and 20). Verified: `grep -rn lib/workspace/permission apps/desktop/src` prints nothing; `design/acts.ts`, `design/inverse.ts` and `design/tests/inverse.test.ts` import `$lib/permission`.
- [x] The baseline loses the `design` to `workspace` lines. Verified: `grep -c "design.*-> workspace" layers.baseline.txt` prints `0`; 34 lines removed, the two `design/{acts,inverse}.ts` upward lines rewritten to `permission/index.ts`.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0; no assertion line changed in any test.

## Relevant areas

- `src/lib/workspace/permission.ts`, `packages/workspace-permission/index.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
