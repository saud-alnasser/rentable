---
status: resolved
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

- [x] A component test finds the welcome's two choices in one size variant, with at most one of them
      prominent. *Verified: `npx vitest run src/lib/startup/tests/sign-in.svelte.test.ts` printed 16 passed; "the welcome offers two ways in, one size, each saying whose it is" finds the two
      stacked at the large size's padding, full width, with only the first prominent, in both
      locales.*
- [x] A component test counts exactly one prominent button on the welcome and one on the wall.
      *Verified: "the welcome and the wall each draw exactly one prominent button", the wall's being
      "sign in".*
- [x] No `InputGroup.Addon` renders on either screen. Glyphs remain only on buttons whose glyph is
      recognisable on its own. *Verified: "neither screen draws a glyph in a field or on its buttons,
      nor a back or a position" finds no addon and no `svg` in a step button on either screen.*
- [x] Neither screen draws a back control or a position. *Verified: the same test.*
- [x] On the wall, the username field is focused on arrival, Enter signs in, and the password field
      carries no value on mount. *Verified: "arriving at the wall focuses the username, the password
      is empty, and Enter signs in".*
- [x] The "signed out elsewhere" notice and a sign-in error still show, as one line each.
      *Verified: "a machine signed out from another one reads the same wall with the reason on it" and
      "a pair that did not open is said on the wall", with the shell's words closed behind details.*
- [x] A person with no username and password can still disconnect from the wall, through the foot
      control's popover. *Verified: "disconnect is in the foot, asks once naming the organization, and
      confirming runs it", and "leaving the question runs nothing".*
- [x] Pressing "can't sign in?" replaces it with the one sentence, announced as a status.
      *Verified: the test of that name finds the control gone and `role="status"` holding
      `helpAnswer`, in both locales.*
- [x] New and changed strings exist in both locales, in lower case, and the casing test passes.
      *Verified: the words of the evidence table are in `organization/session/i18n/{en,ar}.ts`; the
      node suite's i18n and casing tests pass (1438 pass; the five failures are the dashboard's
      date-dependent ones the run log records); `pnpm check` printed 0 errors.*
- [x] The welcome and the wall pass `WayInPreferences` (`$lib/settings/ui`) to the surface's `foot`,
      and nothing else goes there; the wall alone hands it "use a link" and "disconnect this
      machine" as its extras. *Verified: "the foot is the preferences control, and only the wall
      hands it the link and disconnect".*

## Relevant areas

- `apps/desktop/src/lib/startup/component/sign-in.svelte`, its tests
- `apps/desktop/src/lib/organization/session/i18n/{en,ar}.ts`
- `apps/desktop/src/lib/organization/component/disconnect-dialog.svelte`

## Constraints

- What the wall does is unchanged: sign-in, disconnect, the link way in (spec, *Constraints*).

## Notes

*Corrected 2026-10-01 by ticket 01 ([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/evidence/prototypes/the-look-of-the-way-in]]): the human chose the welcome's look and asked for plain words and for "can't sign in?" to answer with a sentence.*

*Corrected 2026-10-01 while building ticket 04: the foot control is built there, and each way-in
screen passes it as it moves onto the surface, so the wiring is this ticket's criterion.*

*Built 2026-10-01: the way-in surface gained `named`, so the welcome's "rentable" and the
wall's organization are drawn as written; "rentable" stays in Latin in both locales, as the
wordmark.*
