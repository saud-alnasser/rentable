---
status: resolved
blocked-by: []
---

# fix(desktop): the password is selected after a failed sign-in, and an unknown switch is refused

## Outcome

At the human's word on 2026-10-01, closing two review findings: a sign-in that fails puts the
cursor back in the password with what was typed selected, so the next keystroke replaces it, and a
switch to a workspace the session does not hold is refused rather than opened under a loading line
that names nothing.

## Acceptance Criteria

Traces requirements 8 and 12 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 8 and 12. From review round 1: correctness 9; from ticket 15, its noticed item.

- [x] A component test types a password, fails the sign-in, and finds the password focused, its
      value kept, and the whole of it selected. *Verified: `npx vitest run
      src/lib/startup/tests/sign-in.svelte.test.ts` printed 21 passed, including "a sign-in that
      fails puts the cursor back in the password, with what was typed selected".*
- [x] A `node:test` asks for a switch to a workspace the session does not hold and finds nothing
      opened, the state `ready`, and `switching` `null`. *Verified: `running.test.ts` printed 16
      pass, including "a switch to a workspace the session does not hold does nothing".*

## Relevant areas

- `apps/desktop/src/lib/startup/component/sign-in.svelte`, `startup/switch.ts`, their tests

## Notes

*Appended 2026-10-01 at the human's answer to the close's questions. The same answers accepted one
changeset for the effort over one per ticket (review round 1, standards 6), and read criterion 3
as at most one prominent button, recorded in the spec.*
