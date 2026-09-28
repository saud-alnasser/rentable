---
status: open
blocked-by: [33]
---
# refactor(desktop): the four fat routes delegate

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`routes/+layout.svelte`, `routes/organization/new/+page.svelte`, `routes/organization/join/+page.svelte` and `routes/settings/+page.svelte` move their state and mutation wiring into their features, as the entity routes already do; the route tests under `routes/organization/` follow their subject.

## Acceptance Criteria

Traces requirement 17 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 17.

- [ ] None of the four holds mutation wiring (criterion 17).
- [ ] The dependency test gains the rule that a `routes/` file imports only `$lib/*/component` and `$lib/app`.
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- the four routes

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
