---
status: open
blocked-by: [27]
---
# refactor(desktop): settings renders the sections features contribute

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`settings/component/area.svelte` renders the sections surfaces declare `on: 'settings'`; the organization contributes its panels and `settings/` imports nothing from `organization/`.

## Acceptance Criteria

Traces requirements 4 and 5 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 4 and 5.

- [ ] `settings/` imports no `organization` module; the baseline loses the organization and settings cycle (criteria 4 and 5).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/settings/component/area.svelte`, `src/lib/organization/component/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
