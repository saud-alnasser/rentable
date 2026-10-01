---
status: resolved
blocked-by: []
---

# refactor(desktop): what this effort retired leaves no word or wiring behind

## Outcome

The settings route delegates again, its signed-out back control drawn by the settings page. The
comments that still describe the signed-out rail or the sign-in on the standalone surface say what
is true now. The retired `layout.workspaceMenu.switchTo` is on the retired list. The settings' keys
have one home, and no test mocks a module nothing imports. The session strings' header comments
wrap at the repository's width.

## Acceptance Criteria

Traces requirements 7 and 11 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 7 and 11. From review round 1: standards 1, 2, 8, 10 and 12; correctness 5.

- [x] `routes/settings/+page.svelte` only composes, as the other routes do; the back control to the
      way in is drawn by `settings/component/page.svelte` when signed out, in the same place, and a
      component test still finds it signed out and not signed in. *Verified: the route holds no
      `BackControl`; `npx vitest run src/lib/settings/tests/page.svelte.test.ts` printed 5 passed,
      including back drawn signed out at `start-4 top-4` and none signed in.*
- [x] `settings/router.ts`'s comment on its public procedures and `standalone-surface.svelte`'s
      header say what is true after this effort, each with a dated correction note. *Verified: both
      read against `rules/interface` and the surface's five callers, each with a "Corrected
      2026-10-01, effort 843" note.*
- [x] `'layout.workspaceMenu.switchTo'` is in `RETIRED` in `i18n/tests/organization.test.ts`, which
      passes. *Verified: line 178 holds it; "both locales have let go of every string the retired pages
      read" passes.*
- [x] `settings/query.ts` no longer re-exports `keys`, and nothing imports it from there;
      `workspace/tests/app-database-unreadable.test.ts` mocks nothing that module no longer
      imports, and its comment says what it reaches. *Verified: no `export { keys }` in `query.ts`,
      no `settings/query` mock in the test, and the test passes under the node suite.*
- [x] The header comments of `organization/session/i18n/{en,ar}.ts` wrap at 100 columns. *Verified:
      no comment line over 100 columns.*

## Relevant areas

- `apps/desktop/src/routes/settings/`, `apps/desktop/src/lib/settings/`
- `packages/design/src/lib/block/standalone-surface.svelte`
- `apps/desktop/src/lib/i18n/tests/organization.test.ts`, `apps/desktop/src/lib/workspace/tests/`
- `apps/desktop/src/lib/organization/session/i18n/`

## Notes

*Appended 2026-10-01 from review round 1.*
