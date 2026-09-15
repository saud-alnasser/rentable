---
status: open
blocked-by: ['08']
---

# fix(layout): the account menu holds settings and sign out

## Outcome

The account menu no longer offers the "you" row: signed in, it holds settings and sign out;
signed out, it holds settings and sign in. The you section is still reached from the settings
rail, the palette and the address.

## Acceptance Criteria

Traces requirement 17 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]] as
corrected on 2026-09-15, and its criterion 17.

- [ ] `layout/component/account-menu.svelte` draws settings and sign out for a signed-in
      member and nothing else below the identity; `account-signed-out.svelte` keeps settings
      and sign in; `account-menu.svelte.test.ts` asserts the rows are exactly those two, that
      no row names the you section, and that settings opens `/settings`.
- [ ] Any string that existed only for the removed row is gone from both locales; the
      `settings.section.you` key stays, since the rail reads it.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass; a changeset (`@rentable/desktop`,
      patch) rides with the change.

## Relevant areas

`apps/desktop/src/lib/layout/component/{account-menu,account-signed-out}.svelte`,
`layout/tests/account-menu.svelte.test.ts`, `i18n/{en,ar}/index.ts`.

## Constraints

- **Why**: the human, on their first run of the finished build (2026-09-15): the menu should
  hold settings and the way in or out and nothing else.
- **The section itself does not move.** Only the menu's row goes.

## Notes

Nothing yet.
