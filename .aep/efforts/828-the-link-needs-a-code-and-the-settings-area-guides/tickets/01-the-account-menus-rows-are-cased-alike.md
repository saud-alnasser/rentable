---
status: resolved
---

# fix(layout): the account menu's rows are cased alike

## Outcome

The sign-in row and the sign-out row of the rail's account menu are drawn with the same
capitalize treatment the settings row beside them already carries, signed in and signed out,
and the two strings stay lowercase in both locales.

## Acceptance Criteria

Traces requirement 10 of [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]],
and its criterion 10.

- [x] `layout/component/account-menu.svelte` puts `class="capitalize"` on the span that draws
      `$LL.common.actions.signOut()`, and `layout/component/account-signed-out.svelte` on the
      span that draws `$LL.common.actions.signIn()`; neither string changes in
      `i18n/en/index.ts` or `i18n/ar/index.ts`. *Verified 2026-09-15 on the effort branch:
      `git diff HEAD~1 HEAD -- apps/desktop/src/lib/layout/component` shows the two spans
      gaining `class="capitalize"` and nothing else; `git diff HEAD~1 HEAD -- apps/desktop/src/lib/i18n | wc -l`
      printed `0`.*
- [x] `layout/tests/account-menu.svelte.test.ts` asserts, with a session and without one,
      that the sign-out span and the sign-in span carry the class the settings span carries.
      *Verified: `pnpm exec vitest run src/lib/layout/tests/account-menu.svelte.test.ts`
      printed `Test Files 1 passed (1)`, `Tests 7 passed (7)`; the two new tests compare each
      span's `className` to the settings span's, and the child's mutation check (both classes
      stripped) failed exactly those two.*
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass. *Verified in the run's worktree:
      `pnpm check` exit 0 (`apps/desktop check: COMPLETED 9302 FILES 0 ERRORS 0 WARNINGS`,
      `packages/design check: COMPLETED 2807 FILES 0 ERRORS 0 WARNINGS`, Prettier clean);
      `pnpm lint` exit 0; `pnpm test` exit 0 (`Tasks: 4 successful, 4 total`, desktop
      `179 passed`, design `58 passed`).*

## Relevant areas

`apps/desktop/src/lib/layout/component/{account-menu,account-signed-out}.svelte` and
`apps/desktop/src/lib/layout/tests/account-menu.svelte.test.ts`.

## Constraints

- **Casing anywhere else is out of scope** (spec, *Out of Scope*): the identity block's
  sign-out button and the wall's sign-in button are not touched.
- No changeset: the change is a class on two rows, and nothing a person reads changes.

## Notes
