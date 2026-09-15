---
status: open
---

# fix(layout): the account menu's rows are cased alike

## Outcome

The sign-in row and the sign-out row of the rail's account menu are drawn with the same
capitalize treatment the settings row beside them already carries, signed in and signed out,
and the two strings stay lowercase in both locales.

## Acceptance Criteria

Traces requirement 10 of [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]],
and its criterion 10.

- [ ] `layout/component/account-menu.svelte` puts `class="capitalize"` on the span that draws
      `$LL.common.actions.signOut()`, and `layout/component/account-signed-out.svelte` on the
      span that draws `$LL.common.actions.signIn()`; neither string changes in
      `i18n/en/index.ts` or `i18n/ar/index.ts`.
- [ ] `layout/tests/account-menu.svelte.test.ts` asserts, with a session and without one,
      that the sign-out span and the sign-in span carry the class the settings span carries.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass.

## Relevant areas

`apps/desktop/src/lib/layout/component/{account-menu,account-signed-out}.svelte` and
`apps/desktop/src/lib/layout/tests/account-menu.svelte.test.ts`.

## Constraints

- **Casing anywhere else is out of scope** (spec, *Out of Scope*): the identity block's
  sign-out button and the wall's sign-in button are not touched.
- No changeset: the change is a class on two rows, and nothing a person reads changes.

## Notes
