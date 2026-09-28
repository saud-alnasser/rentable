---
status: open
blocked-by: [40]
---
# refactor(desktop): every feature and capability has one shape and an entry

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Each feature and capability has an `index.ts` re-exporting only Node-loadable modules, and follows the canonical shape of the plan (*Components*). Every cross-module import goes through an entry. [[rules/module-layout]] states the shape and the layer rule. The TypeScript baseline is empty.

## Acceptance Criteria

Traces requirements 4 and 6 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 4 and 6.

- [ ] The dependency test's baseline is empty (criteria 4 and 5).
- [ ] [[rules/module-layout]] states the canonical shape and lists each deviation with its reason (criterion 6).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
