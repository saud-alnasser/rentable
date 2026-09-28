---
status: open
blocked-by: [27, 15, 18]
---
# refactor(desktop): the command menu is a capability built from surfaces

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`layout/palette.ts`, `palette.svelte`, `record-search.ts` and `create.ts` become `src/lib/palette/`: its search group, create group and acts are built from each surface's `search`, `create` and `acts`, handed over by `app/`. The organization's offerings become the organization surface's.

## Acceptance Criteria

Traces requirements 2 and 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 2 and 20.

- [ ] `palette/` imports no feature (criteria 2 and 20).
- [ ] The palette tests keep their assertions.
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/layout/record-search.ts`, `create.ts`, `palette.ts`, `component/palette.svelte`, `src/lib/organization/palette.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
