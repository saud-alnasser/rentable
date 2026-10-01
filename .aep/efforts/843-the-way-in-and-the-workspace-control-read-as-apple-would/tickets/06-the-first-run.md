---
status: resolved
blocked-by: [05]
---

# feat(desktop): the first run is one surface that changes step

## Outcome

The walk draws on the way-in surface and hands it the step key, the position and the back. Moving
from the welcome into the walk, between its steps, and back again runs the one directional
transition, while the mark and the column hold still. The connect, name and existing steps each
carry one prominent action, and their fields have no glyphs.

## Acceptance Criteria

Traces requirements 1, 3, 4, 5, 6 and 8 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 1, 3, 4, 5, 6 and 8.

- [x] `organization/setup/component/walk.svelte` renders `way-in-surface` with `step`, `position` and
      `back`, and its own position line is gone. *Verified: `npx vitest run src/lib/organization/setup` printed 60 passed; "every step renders the position
      line" finds one `[data-way-in-position]` per step and no `[data-setup-position]`, and the
      corner back calls `onBack`.*
- [x] The route change from the welcome to `/organization/new` and back starts inside a view
      transition from SvelteKit's `onNavigate`. It is feature-detected and uses the same group names
      as the surface. *Verified: root's `onNavigate` runs `crossWayIn` from
      `@rentable/design/way-in-transition.js` when `wayInCrossing` names the move;
      `way-in-transition.test.ts` printed 3 pass (inside a transition, the shift by direction and
      crossing, nothing without support or under reduced motion) and `screen.test.ts` 26 pass,
      including "a move from the welcome into a walk runs forward, and back out runs back". The
      names are the surface's `way-in-mark` and `way-in-content`.*
- [x] A component test per step counts exactly one prominent button. "Forget account" is a quiet
      control. *Verified: "every step draws exactly one prominent button, and forgetting the account
      is quiet", over connect, connect granted, name and existing.*
- [x] The connect step reads "connect Turso", "your organization is stored in your Turso account.",
      one prominent "connect", and one line under it, "your browser opens so you can allow access."
      The "before you connect" disclosure and its statements are gone, with their strings, in both
      locales. *Verified: "the connect step says one line, one connect, and one line under it, and
      no facts" in both locales; `setup.test.ts` pins the words as literals; the six keys are gone
      and listed as retired in `i18n/tests/organization.test.ts`, which passes.*
- [x] The name step reads "name your organization", "you'll sign in with this username and
      password.", fields "organization name", "username", "password" with "at least 12
      characters.", and "create organization". *Verified: the words are in
      `organization/i18n/{en,ar}.ts`; "the naming step presents exactly three fields" reads the labels,
      the floor and the create.*
- [x] No `InputGroup.Addon` renders on any step. *Verified: "no step draws a glyph in a field or on
      its buttons", over every step and the group field.*
- [x] On arrival at the name and existing steps, focus lands in the first field. Enter submits, and
      no password field carries a value. *Verified: "arriving at the name and existing steps puts
      focus in the first field, with no password filled"; Enter is the form's submit, which "the
      ordinary create carries no group at all" fires.*
- [x] A test holds 824 requirement 2: pressing back while a consent is pending abandons the poll at
      once, whether or not a transition is running. *Verified: `first-run.svelte.test.ts`, "back
      while a consent is pending stops the poll at once, even with the navigation still running":
      the poll's session is `null` right after back, with `goto` held open.*
- [x] Every step of the first run passes `WayInPreferences` to the surface's `foot`, with no extras.
      *Verified: "every step carries the preferences control at its foot, and nothing else there".*

## Relevant areas

- `apps/desktop/src/lib/organization/setup/component/{walk,connect-step,name-step,existing-step,first-run}.svelte`
- `apps/desktop/src/routes/organization/new/+page.svelte`, `apps/desktop/src/routes/+layout.svelte`
- `apps/desktop/src/lib/organization/i18n/{en,ar}.ts`

## Constraints

- Behaviour and step order are unchanged (spec, *Constraints*).

## Notes

*Corrected 2026-10-01 by ticket 01 ([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/evidence/prototypes/the-look-of-the-way-in]]): the human found "before you connect" odd and asked for plain words; the consent's facts leave the way in.*

*Corrected 2026-10-01 while building ticket 04: the foot control is built there, and each way-in
screen passes it as it moves onto the surface, so the wiring is this ticket's criterion.*

*Built 2026-10-01: back from the connect step now lets the consent go before the address moves,
since the route change runs inside a transition; the dashboard action that sat in the first fact
went with the facts.*
