---
status: resolved
blocked-by: [10]
---
# refactor(desktop): mutation and the query cache are a capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`design/mutation.ts` and `design/query.ts` become `src/lib/mutation/`: `declareMutation` and the workspace cache policy behind one `index.ts`. It reaches history through `$lib/history`. The cache prefixes stay a list here until the composition root hands them over.

## Acceptance Criteria

Traces requirements 13 and 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 13 and 20.

- [x] `declareMutation` is imported from `$lib/mutation` everywhere (criteria 13 and 20). Verified: every source import of `declareMutation` (complex, contract, payment, tenant and workspace `query.ts`) is `from '$lib/mutation'`; a search for an import of it from anywhere else prints nothing, and `design/(mutation|query)` has no hit. 40 raw `createMutation` calls remain in `organization/query.ts` (32) and `settings/query.ts` (8): none invalidates workspace data, which `declareMutation` always does, so routing them would change behaviour; recorded for converge against criterion 13.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0, validate 0; test changes are import paths, one `vi.mock` path, and two merged duplicate dynamic imports.

## Relevant areas

- `src/lib/design/mutation.ts`, `src/lib/design/query.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
