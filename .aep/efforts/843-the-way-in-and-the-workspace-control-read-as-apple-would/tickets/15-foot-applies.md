---
status: resolved
blocked-by: []
---

# fix(desktop): the foot control offers only what applies, and the wall keeps its focus

## Outcome

While a sign-in is running, the wall's "use a link" and "disconnect this machine" are disabled, as
they were before the foot control held them. The no-workspace screen's foot control offers no
"all settings", since `/settings` cannot draw past that screen. A sign-in that fails puts the
cursor back in the wall's password field. The welcome's two buttons space their label and line on
the ladder.

## Acceptance Criteria

Traces requirements 6, 7 and 8 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 7 and 8, and the constraint that the way in's behaviour does not change. From
review round 1: correctness 3, 4 and 8; standards 3 in part.

- [x] `WayInPreferences` takes a disabled state for a step's acts, and the wall passes it while
      `isSigningIn`. A component test opens the foot during a sign-in and finds both acts disabled.
      *Verified: `npx vitest run src/lib/startup/tests/sign-in.svelte.test.ts` printed 21 passed,
      including "while a sign-in runs, the foot offers the link and disconnect disabled".*
- [x] `WayInPreferences` can be drawn without "all settings", and the no-workspace screen draws it
      so. A component test finds no `[data-way-in-all-settings]` there, and still finds it on the
      welcome and the walk. *Verified: "the foot offers all settings on the welcome, and not on the
      no-workspace screen" and the walk's "the foot of the walk offers all settings" pass.*
- [x] After a sign-in that fails (an error arrives with `isSigningIn` back to false), focus is in
      the password field. A component test drives it. *Verified: "a sign-in that fails puts the cursor
      back in the password" passes, and fails with the fix removed.*
- [x] `sign-in.svelte` uses no spacing step off the ladder in `rules/frontend`. *Verified: a grep for
      spacing classes finds gap-4, gap-3, gap-1 and py-3, all on the ladder.*

## Relevant areas

- `apps/desktop/src/lib/settings/component/way-in-preferences.svelte`, its tests
- `apps/desktop/src/lib/startup/component/{sign-in,no-workspace}.svelte`, their tests

## Notes

*Appended 2026-10-01 from review round 1.*
