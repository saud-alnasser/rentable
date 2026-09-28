---
status: resolved
blocked-by: [01]
---
# chore(design): the primitive families nothing imports are removed

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The 23 families listed in [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/evidence/survey]] section 5 leave `packages/design/src/lib/primitive/` with their tests, the two harnesses that serve only them, and the five dependencies only they use.

## Acceptance Criteria

Traces requirement 16 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 16.

- [x] None of the 23 directories, their tests or `carousel-harness.svelte` and `pagination-harness.svelte` remain (criterion 16). Verified: a loop over the 23 survey families (accordion ... tabs) testing `packages/design/src/lib/primitive/<family>` printed `gone=23`; `git ls-files | grep -c -E "(carousel|pagination)-harness"` printed `0`. The four family tests lived inside their directories.
- [x] `embla-carousel-svelte`, `layerchart`, `paneforge`, `vaul-svelte`, `@tanstack/table-core` are gone from `packages/design/package.json` and the lockfile (criterion 16). Verified: `grep -c` of each of the five names in `packages/design/package.json` and `pnpm-lock.yaml` printed `pkg=0 lock=0` for all five; `pnpm install --frozen-lockfile` exited 0.
- [x] `pnpm check` and the build pass for both packages. Verified: in the run's tree: `pnpm check` exit 0, `pnpm exec eslint .` exit 0, `pnpm test` `Tasks: 4 successful, 4 total`, `pnpm build:web` exit 0 (the design package has no build of its own; the web build compiles it).

## Relevant areas

- `packages/design/src/lib/primitive/`, `packages/design/src/tests/`, `packages/design/package.json`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- Re-grep each family against the whole repository before deleting; the survey is a snapshot.
