---
status: open
blocked-by: [04]
---

# feat(desktop): the welcome introduces rentable and the wall asks for one thing

## Outcome

`startup/component/sign-in.svelte` draws on the way-in surface.

- **With no organization, it is the welcome:** the mark, "rentable" in lower case, "track rent,
  receipts and reminders.", and the two ways in as stacked full-width buttons of one size, each a
  label over one short line: **set up with Turso** (prominent) and join with a link (outlined).
- **Locked or signed out elsewhere, it is the wall:** the organization's name under the mark, "sign
  in to continue.", username and password fields with no glyphs, one prominent "sign in", and
  "can't sign in?", which becomes one sentence when pressed: "ask a manager or the owner of your
  organization for help." Disconnect and "use a link" move to the foot control (ticket 04).

The words are the evidence file's table, in both locales.

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
- [ ] A person with no username and password can still disconnect from the wall, through the foot
      control's popover.
- [ ] Pressing "can't sign in?" replaces it with the one sentence, announced as a status.
- [ ] New and changed strings exist in both locales, in lower case, and the casing test passes.

## Relevant areas

- `apps/desktop/src/lib/startup/component/sign-in.svelte`, its tests
- `apps/desktop/src/lib/organization/session/i18n/{en,ar}.ts`
- `apps/desktop/src/lib/organization/component/disconnect-dialog.svelte`

## Constraints

- What the wall does is unchanged: sign-in, disconnect, the link way in (spec, *Constraints*).

## Notes

*Corrected 2026-10-01 by ticket 01 ([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/evidence/prototypes/the-look-of-the-way-in]]): the human chose the welcome's look and asked for plain words and for "can't sign in?" to answer with a sentence.*
