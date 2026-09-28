---
status: open
blocked-by: [01]
---
# chore(design): the primitive families nothing imports are removed

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The 23 families listed in [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/evidence/survey]] section 5 leave `packages/design/src/lib/primitive/` with their tests, the two harnesses that serve only them, and the five dependencies only they use.

## Acceptance Criteria

Traces requirement 16 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 16.

- [ ] None of the 23 directories, their tests or `carousel-harness.svelte` and `pagination-harness.svelte` remain (criterion 16).
- [ ] `embla-carousel-svelte`, `layerchart`, `paneforge`, `vaul-svelte`, `@tanstack/table-core` are gone from `packages/design/package.json` and the lockfile (criterion 16).
- [ ] `pnpm check` and the build pass for both packages.

## Relevant areas

- `packages/design/src/lib/primitive/`, `packages/design/src/tests/`, `packages/design/package.json`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- Re-grep each family against the whole repository before deleting; the survey is a snapshot.
