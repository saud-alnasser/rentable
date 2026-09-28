---
status: open
blocked-by: [01]
---
# refactor(desktop): permission is a capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`workspace/permission.ts` becomes `src/lib/permission/` with an `index.ts`, the first capability. `RecordKind` and the view, export and import flag tables derive from `@rentable/workspace-permission`'s `RECORD_KINDS` and `FAMILIES` instead of restating them. Its 28 importers import `$lib/permission`. The dependency test's layer map gains `permission` as a capability.

## Acceptance Criteria

Traces requirements 1, 7 and 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 1, 7 and 20.

- [ ] `RecordKind` is `(typeof RECORD_KINDS)[number]` and declared nowhere else in `src/lib` (criterion 1).
- [ ] Nothing imports `$lib/workspace/permission`; `design/` imports `$lib/permission` (criteria 7 and 20).
- [ ] The baseline loses the `design` to `workspace` lines.
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/workspace/permission.ts`, `packages/workspace-permission/index.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
