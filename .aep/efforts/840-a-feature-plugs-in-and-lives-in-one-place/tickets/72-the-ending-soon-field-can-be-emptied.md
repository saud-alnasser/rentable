---
status: resolved
---
# fix(desktop): the ending-soon field can be emptied

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Found by the human on the running app, 2026-09-30: editing the ending-soon notice in settings replaced the page with "this screen could not be shown". A number field bound in Svelte 5 reads `null` while it holds no number, emptied or partway through an edit, and `settings/component/ending-soon.svelte` called `.trim()` on it (`Cannot read properties of null (reading 'trim')`, logged as `layout.boundary`). The fault predates the effort: `main` has the same line. The field now reads `null` as empty, so it stays on screen and a save without a number says a notice needs one. Out of this effort's scope (requirement 19 holds behaviour still), fixed here because it blocks the running-app checks; a patch changeset rides with it.

## Acceptance Criteria

Traces requirement 19 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]].

- [x] An emptied ending-soon field stays on screen. Verified: `settings/tests/ending-soon.svelte.test.ts` failed with `Cannot read properties of null (reading 'trim')` before the fix and passes after it; on the running app, emptying the field on `/settings` left the page up and the field in place.
- [x] No other number field trims its bound value. Verified: of the components with `type="number"`, only `ending-soon.svelte` calls `.trim()`.
- [x] The integration gate passes on this commit. Verified: `svelte-check` 0 errors, eslint and prettier clean on the changed files, the settings and settings-area component tests `35 passed`.

## Relevant areas

- `src/lib/settings/component/ending-soon.svelte`, `src/lib/settings/tests/`

## Constraints

- One commit, and it passes the integration gate alone ([[rules/version-control]]).
