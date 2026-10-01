---
status: resolved
blocked-by: [06]
---

# feat(desktop): the join is one surface that changes step

## Outcome

The connect screen draws on the way-in surface with a step key, the back, and the same position
treatment as the first run. Paste, reading, the password choice, refused and unreachable each carry
one prominent action, and their fields have no glyphs. The link and code fields stay left to right.

## Acceptance Criteria

Traces requirements 1, 3, 4, 5, 6 and 8 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 1, 3, 4, 5, 6 and 8.

- [x] `organization/setup/component/connect-screen.svelte` renders `way-in-surface` with `step`, with
      `position` drawn by `way-in-position`, and with `back`. *Verified: `npx vitest run src/lib/organization/setup` printed 65 passed; "the link is step
      1 of 2 and the password step 2 of 2, above the title" finds one `[data-way-in-position]`, and
      "every step carries exactly one back control in the corner" still passes.*
- [x] The route change from the welcome or the wall into `/organization/join` runs the transition, as
      ticket 06 does for the first run. *Verified: `wayInCrossing` names a move into the join from any
      address the card covers, the wall's included; `screen.test.ts` printed 27 pass, including "a
      move from the wall over any address into the join runs forward too".*
- [x] A component test per step counts exactly one prominent button. *Verified: "every step with an
      act draws exactly one prominent button", over paste, unreachable, a link used here, and the
      password.*
- [x] Paste is step 1 of 2 and the password choice step 2 of 2. Paste reads "join with a link",
      "paste the link and enter the code you were given.", fields "link" and "code" ("6
      characters."), and "continue". The password choice reads "choose a password", "you'll use it
      to sign in. it can't be recovered.", fields "password" and "confirm password", and "join".
      Nothing on the path names Turso. *Verified: "the join reads in the plain words, and names no
      Turso on any step", in both locales, pinning the English words.*
- [x] No `InputGroup.Addon` renders. The link and code fields keep `dir="ltr"` and accept a paste.
      *Verified: "the link and code fields draw no glyph, stay left to right, and take a paste", in
      Arabic, and "the password step draws its two fields and its join with no glyph".*
- [x] The link field is focused on arrival at paste, and the password field at the password choice.
      Enter submits. *Verified: "arriving at the form focuses the link, and at the password step the
      password"; Enter is each form's submit, which "submitting the form calls onConnect" fires.*
- [x] A `rentable://` link that arrives while the app runs still lands on paste with the link filled.
      *Verified: `join.svelte.test.ts`, "a link that arrives while the join is open lands on the form
      with the link filled", step 1 of 2 with the code empty.*
- [x] Both steps of the join pass `WayInPreferences` to the surface's `foot`, with no extras.
      *Verified: "both steps carry the preferences control at their foot, and nothing else there".*

## Relevant areas

- `apps/desktop/src/lib/organization/setup/component/{connect-screen,join}.svelte`, `setup/connect.ts`
- `apps/desktop/src/routes/organization/join/+page.svelte`

## Constraints

- Behaviour and step order are unchanged (spec, *Constraints*).

## Notes

*Corrected 2026-10-01 by ticket 01 ([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/evidence/prototypes/the-look-of-the-way-in]]): the human asked for the link path to read like the first run, in plain words.*

*Corrected 2026-10-01 while building ticket 04: the foot control is built there, and each way-in
screen passes it as it moves onto the surface, so the wiring is this ticket's criterion.*

*Built 2026-10-01: the form's button reads "continue" (`join.continue`), and reading, unreachable
and refused count as step 1; the organization line on the password step stays, since it is read
from the link and is not a field.*
