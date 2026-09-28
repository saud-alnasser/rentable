---
status: open
blocked-by: [21]
---
# refactor(desktop): cache prefixes come from what features declare

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Each record feature's `feature.ts` declares its `kind` and cache `prefix`; `mutation/`'s cache policy is built by `app/` from the list (plan, *How a capability is configured*), and the `workspacePrefixes` table and `workspace/query.ts`'s hand list go.

## Acceptance Criteria

Traces requirements 1 and 2 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 1 and 2.

- [ ] No cache prefix is listed outside a feature's own declaration (criteria 1 and 2).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/mutation/` (was `design/query.ts`), `src/lib/workspace/query.ts:39`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
