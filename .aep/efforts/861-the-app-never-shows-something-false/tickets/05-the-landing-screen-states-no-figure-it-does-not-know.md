---
status: open
blocked-by: [03]
---

# fix(desktop): the landing screen states no figure it does not know

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Components, `dashboard/component/landing.svelte`*).

## Outcome

The figure band and the sections load together under one loading block, a failed read draws the failed state in place of both, and *nothing to chase* appears only after a read that succeeded.

## Acceptance Criteria

Traces requirement 2 and criterion 2.

- [ ] One `<Loading>` wraps the band and the sections with a band-shaped skeleton; no `?? 0` remains on a figure.
- [ ] `dashboard/tests/landing.svelte.test.ts`: with `host.dashboardGet` pending the band draws no `0`; rejected, the failed state is drawn, the empty state is not, and *try again* re-runs the read.

## Relevant areas

- apps/desktop/src/lib/dashboard/component/landing.svelte, dashboard/query.ts, dashboard/tests/landing.svelte.test.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- The ending-soon header with no rows stays as [[rules/interface]], under *Landing screen*, fixes it.
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
