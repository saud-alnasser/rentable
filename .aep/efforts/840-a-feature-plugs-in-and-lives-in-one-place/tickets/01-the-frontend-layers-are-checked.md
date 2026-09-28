---
status: open
---
# test(desktop): the frontend layers are checked against a baseline that only shrinks

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

A `node --test` file reads `src/lib/` and fails on an import that breaks the four-layer rule of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]] (*Architecture*): an upward import, a cycle between modules, an import past another module's `index.ts`, a feature named by import or record-kind literal outside its own files and `app/`. The layer each directory belongs to is a map in the test, which later tickets extend as they create homes. Today's violations are a checked-in baseline; the test fails on any violation not in it and on any baseline line that no longer occurs, so the baseline can only shrink.

## Acceptance Criteria

Traces requirements 2, 4, 5 and 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 2, 4, 5 and 20.

- [ ] The test runs in `pnpm test` and passes on this commit with the baseline recording every current violation (criteria 4 and 5).
- [ ] A scratch edit adding an upward import, cycle or deep import fails it; removing a violation without deleting its baseline line fails it (criteria 2, 4, 5 and 20).
- [ ] Type-only imports (`import type`) are not counted.

## Relevant areas

- `src/lib/api/tests/boundaries.test.ts` (the pattern to follow)
- `src/tests/` for shared scaffolding

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- No new dependency: read the tree with `node:fs` as `boundaries.test.ts` does (plan, *Testing Strategy*).
