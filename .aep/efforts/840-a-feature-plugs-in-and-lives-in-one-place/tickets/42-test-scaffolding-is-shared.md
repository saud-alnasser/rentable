---
status: open
blocked-by: [41]
---
# test(desktop): each runner has one shared harness

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The four `tests/testing.ts` and four `providers.svelte` become one harness per runner under `src/tests/`, and the design package's and the desktop's copies of the source-reading helper become one.

## Acceptance Criteria

Traces requirement 13 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 13.

- [ ] One harness per runner (criterion 13).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/*/tests/testing.ts`, `src/lib/*/tests/providers.svelte`, `src/tests/source.ts`, `packages/design/src/tests/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
