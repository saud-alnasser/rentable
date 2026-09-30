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
- [ ] No `InputGroup.Addon` renders. The link and code fields keep `dir="ltr"` and accept a paste.
- [ ] The link field is focused on arrival at paste, and the password field at the password choice.
      Enter submits.
- [ ] A `rentable://` link that arrives while the app runs still lands on paste with the link filled.

## Relevant areas

- `apps/desktop/src/lib/organization/setup/component/{connect-screen,join}.svelte`, `setup/connect.ts`
- `apps/desktop/src/routes/organization/join/+page.svelte`

## Constraints

- Behaviour and step order are unchanged (spec, *Constraints*).
