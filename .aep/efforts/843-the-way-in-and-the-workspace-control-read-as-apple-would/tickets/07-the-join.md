---
status: open
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

- [ ] `organization/setup/component/connect-screen.svelte` renders `way-in-surface` with `step`, with
      `position` drawn by `way-in-position`, and with `back`.
- [ ] The route change from the welcome or the wall into `/organization/join` runs the transition, as
      ticket 06 does for the first run.
- [ ] A component test per step counts exactly one prominent button.
- [ ] Paste is step 1 of 2 and the password choice step 2 of 2. Paste reads "join with a link",
      "paste the link and enter the code you were given.", fields "link" and "code" ("6
      characters."), and "continue". The password choice reads "choose a password", "you'll use it
      to sign in. it can't be recovered.", fields "password" and "confirm password", and "join".
      Nothing on the path names Turso.
- [ ] No `InputGroup.Addon` renders. The link and code fields keep `dir="ltr"` and accept a paste.
- [ ] The link field is focused on arrival at paste, and the password field at the password choice.
      Enter submits.
- [ ] A `rentable://` link that arrives while the app runs still lands on paste with the link filled.
- [ ] Both steps of the join pass `WayInPreferences` to the surface's `foot`, with no extras.

## Relevant areas

- `apps/desktop/src/lib/organization/setup/component/{connect-screen,join}.svelte`, `setup/connect.ts`
- `apps/desktop/src/routes/organization/join/+page.svelte`

## Constraints

- Behaviour and step order are unchanged (spec, *Constraints*).

## Notes

*Corrected 2026-10-01 by ticket 01 ([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/evidence/prototypes/the-look-of-the-way-in]]): the human asked for the link path to read like the first run, in plain words.*

*Corrected 2026-10-01 while building ticket 04: the foot control is built there, and each way-in
screen passes it as it moves onto the surface, so the wiring is this ticket's criterion.*
