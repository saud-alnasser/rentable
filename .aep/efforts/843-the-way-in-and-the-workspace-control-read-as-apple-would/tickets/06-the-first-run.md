---
status: open
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

- [ ] `organization/setup/component/walk.svelte` renders `way-in-surface` with `step`, `position` and
      `back`, and its own position line is gone.
- [ ] The route change from the welcome to `/organization/new` and back starts inside a view
      transition from SvelteKit's `onNavigate`. It is feature-detected and uses the same group names
      as the surface.
- [ ] A component test per step counts exactly one prominent button. "Forget account" is a quiet
      control.
- [ ] The connect step reads "connect Turso", "your organization is stored in your Turso account.",
      one prominent "connect", and one line under it, "your browser opens so you can allow access."
      The "before you connect" disclosure and its statements are gone, with their strings, in both
      locales.
- [ ] The name step reads "name your organization", "you'll sign in with this username and
      password.", fields "organization name", "username", "password" with "at least 12
      characters.", and "create organization".
- [ ] No `InputGroup.Addon` renders on any step.
- [ ] On arrival at the name and existing steps, focus lands in the first field. Enter submits, and
      no password field carries a value.
- [ ] A test holds 824 requirement 2: pressing back while a consent is pending abandons the poll at
      once, whether or not a transition is running.

## Relevant areas

- `apps/desktop/src/lib/organization/setup/component/{walk,connect-step,name-step,existing-step,first-run}.svelte`
- `apps/desktop/src/routes/organization/new/+page.svelte`, `apps/desktop/src/routes/+layout.svelte`
- `apps/desktop/src/lib/organization/i18n/{en,ar}.ts`

## Constraints

- Behaviour and step order are unchanged (spec, *Constraints*).

## Notes

*Corrected 2026-10-01 by ticket 01 ([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/evidence/prototypes/the-look-of-the-way-in]]): the human found "before you connect" odd and asked for plain words; the consent's facts leave the way in.*
