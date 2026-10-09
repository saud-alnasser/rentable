---
status: resolved
---

# fix(desktop): the money card links only where the member may go

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 2), and the human's call recorded for ticket 05: a figure a member may not view is left out. Found at converge round 1.

## Outcome

On the landing screen the money card is a link to the contracts only for a member who may view contracts; for a member who may not, it shows the figures it may and is not a link.

## Acceptance Criteria

Traces requirement 2.

- [x] The money card's link to `/contracts` is drawn only where the member may view contracts (`CONTRACT_KIND`); otherwise the card is the same figures with no link. Verified: in `landing.svelte` the `<a href=/contracts>` is drawn only under `{#if viewsContracts}` (`memberPermissions.views(CONTRACT_KIND)`), and `{:else}` draws the same figures snippet in a `div`.
- [x] `dashboard/tests/landing.svelte.test.ts`: a member who may view payments and not contracts sees the collected figure and no link to the contracts; a member who may view both still has the link. Verified: `vitest run src/lib/dashboard/tests/landing.svelte.test.ts`: 21 of 21 pass (1 failed before the fix); the member without contracts sees collected and no `/contracts` link, the member with both keeps it.

## Relevant areas

- apps/desktop/src/lib/dashboard/component/landing.svelte, dashboard/tests/landing.svelte.test.ts

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
