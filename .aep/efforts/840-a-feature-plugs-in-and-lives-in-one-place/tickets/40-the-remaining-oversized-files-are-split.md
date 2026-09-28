---
status: open
blocked-by: [38, 39]
---
# refactor(desktop): the remaining oversized files are split

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Every source file under `src/lib` still over 500 lines is split along its concerns: at least `complex/router.ts`, `complex/query.ts`, `payment/router.ts`, `workspace/router.ts`, `settings/component/area.svelte`.

## Acceptance Criteria

Traces requirement 17 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 17.

- [ ] No non-generated source file under `src/lib` passes 500 lines, or it is named in [[rules/module-layout]] with why (criterion 17).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
