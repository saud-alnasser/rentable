---
status: open
blocked-by: [30]
---
# refactor(desktop): the contract groups its sub-concepts

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Contract's eleven flat helpers group into sub-directories by what they serve; `contract/router.ts` (1,637), `component/form.svelte` (1,087), `contract.ts`, `query.ts` and `component/host.svelte` split along their concerns.

## Acceptance Criteria

Traces requirements 6 and 17 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 6 and 17.

- [ ] No file in `contract/` passes 500 lines (criterion 17).
- [ ] `contract/tests/router.test.ts` keeps its assertions, split with its subject where it is.
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/contract/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
