---
status: resolved
blocked-by: [41]
---
# test(desktop): each runner has one shared harness

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The four `tests/testing.ts` and four `providers.svelte` become one harness per runner under `src/tests/`, and the design package's and the desktop's copies of the source-reading helper become one.

## Acceptance Criteria

Traces requirement 13 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 13.

- [x] One harness per runner (criterion 13). Verified: the desktop's runner scaffolding is `src/tests/{providers.svelte, mutation.ts, source.ts, palette-harness.svelte, permission.ts}`: the three smaller provider copies (organization, settings, cell) folded into `providers.svelte`, and `design/tests/testing.ts`'s binding into `mutation.ts`; the source scanner and the Vitest setup exist once, in the dev-only `@rentable/testing` package (`packages/testing/{source,setup}.ts`), which both runners load; the design package keeps its own `providers.svelte`, since it may not import the app. A concept's own port fakes stay beside the port, and `rules/testing` says where each runner's harness lives. The orchestrator added `packages/testing` to the naming guard's trees.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `pnpm install --frozen-lockfile` 0, check 0, eslint 0, desktop vitest `623 passed` and design vitest `114 passed` (each on its own), build:web 0, validate 0; node tests fail only the date-dependent receipt test. Test edits are imports, provider setup and one comment path.

## Relevant areas

- `src/lib/*/tests/testing.ts`, `src/lib/*/tests/providers.svelte`, `src/tests/source.ts`, `packages/design/src/tests/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
