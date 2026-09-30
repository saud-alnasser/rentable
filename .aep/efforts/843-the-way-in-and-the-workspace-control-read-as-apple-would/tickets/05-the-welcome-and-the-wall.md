---
status: open
blocked-by: [04]
---

# feat(desktop): the welcome introduces rentable and the wall asks for one thing

## Outcome

`startup/component/sign-in.svelte` draws on the way-in surface.

- **With no organization, it is the welcome:** the mark, "rentable", one line saying what the app is
  for, and the two ways in as an equal pair with one short line each.
- **Locked or signed out elsewhere, it is the wall:** the organization's name under the mark,
  username and password fields with no glyphs, one prominent "sign in", and "trouble signing in?"
  as a disclosure.

## Acceptance Criteria

Traces requirements 2, 3, 6 and 8 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 2, 3, 5, 6 and 8.

- [ ] A component test finds the welcome's two choices in one size variant, with at most one of them
      prominent.
- [ ] A component test counts exactly one prominent button on the welcome and one on the wall.
- [ ] No `InputGroup.Addon` renders on either screen. Glyphs remain only on buttons whose glyph is
      recognisable on its own.
- [ ] Neither screen draws a back control or a position.
- [ ] On the wall, the username field is focused on arrival, Enter signs in, and the password field
      carries no value on mount.
- [ ] The "signed out elsewhere" notice and a sign-in error still show, as one line each.
- [ ] A person with no username and password can still disconnect from the wall.
- [ ] New and changed strings exist in both locales, in lower case, and the casing test passes.

## Relevant areas

- `apps/desktop/src/lib/startup/component/sign-in.svelte`, its tests
- `apps/desktop/src/lib/organization/session/i18n/{en,ar}.ts`
- `apps/desktop/src/lib/organization/component/disconnect-dialog.svelte`

## Constraints

- What the wall does is unchanged: sign-in, disconnect, the link way in (spec, *Constraints*).
