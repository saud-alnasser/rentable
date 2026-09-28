---
status: open
blocked-by: [12]
---
# refactor(desktop): the list is a capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`design/block/list.svelte`, `list-toolbar.svelte`, `search-field.svelte`, `design/list-keyboard.ts`, `list-motion.ts` and `filter.ts` become `src/lib/list/`. `list.svelte` (1,293 lines) is split along the concerns it mixes while it moves.

## Acceptance Criteria

Traces requirements 17 and 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 17 and 20.

- [ ] No list machinery remains in `design/` (criterion 20).
- [ ] No file in `list/` passes 500 lines (criterion 17).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- the files named

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
