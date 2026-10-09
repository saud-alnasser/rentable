---
status: resolved
blocked-by: [03]
---

# fix(desktop): the landing screen states no figure it does not know

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Components, `dashboard/component/landing.svelte`*).

## Outcome

The figure band and the sections load together under one loading block, a failed read draws the failed state in place of both, and *nothing to chase* appears only after a read that succeeded.

## Acceptance Criteria

Traces requirement 2 and criterion 2.

- [x] One `<Loading>` wraps the band and the sections with a band-shaped skeleton; no `?? 0` remains on a figure. Verified: `grep -c "?? 0" landing.svelte` prints 0; one `<Loading>` wraps the band and the sections with a three-card band skeleton (`data-dashboard-band-skeleton`); a figure the member may not view is left out, as the human chose.
- [x] `dashboard/tests/landing.svelte.test.ts`: with `host.dashboardGet` pending the band draws no `0`; rejected, the failed state is drawn, the empty state is not, and *try again* re-runs the read. Verified: `vitest run src/lib/dashboard/tests/landing.svelte.test.ts`: 19 of 19 pass; pending draws no `0`, rejected draws the failed state and not the empty one, try again re-runs the read, and one test per permission (contracts, payments, units).

## Relevant areas

- apps/desktop/src/lib/dashboard/component/landing.svelte, dashboard/query.ts, dashboard/tests/landing.svelte.test.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- The ending-soon header with no rows stays as [[rules/interface]], under *Landing screen*, fixes it.
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
