---
status: open
blocked-by: [01]
---
# refactor(desktop): dates and periods are one capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`api/date.ts`, `design/date.ts`, `api/period.ts` and `payment/period.ts` become `src/lib/date/` with an `index.ts`. Where two functions do the same thing, one stays.

## Acceptance Criteria

Traces requirements 13 and 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 13 and 20.

- [ ] No date or period module exists outside `date/` (criterion 13).
- [ ] Their tests move with them.
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- the four files named, and their importers

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
