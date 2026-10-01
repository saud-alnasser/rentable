---
status: resolved
blocked-by: [03]
---

# feat(desktop): language and appearance are one quiet control on the way in

## Outcome

The foot of the way-in surface carries one text control that names the current language. It opens a
popover with the language choice, the appearance choice and a link to all settings. A change shows
at once, on whatever step the person is on.

## Acceptance Criteria

Traces requirement 7 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and the half of its criterion 7 about what stays reachable.

- [x] `settings/component/way-in-preferences.svelte`, exported from `$lib/settings/ui` as
      `WayInPreferences`, reuses `language-choice.svelte` and the settings area's appearance control
      unchanged. *Verified: it imports `$lib/design/block/language-choice.svelte` and
      `$lib/settings/component/appearance.svelte`, and `git diff` shows neither changed; `pnpm check`
      printed 0 errors. Moved from `lib/design/block/`: that home is layer 1 and may not import the
      settings feature whose control it reuses.*
- [x] A component test changes the language from the popover and finds the step's title in the other
      language, with `dir` flipped. *Verified: `npx vitest run
      src/lib/settings/tests/way-in-preferences.svelte.test.ts` printed 4 passed, including "choosing
      another language redraws the step in it, and turns the reading direction" (title English to
      Arabic, `dir` ltr to rtl, and `ar` written to the settings).*
- [x] A component test changes the appearance and finds the `.dark` class toggled. *Verified: the
      same run, "choosing dark draws dark at once".*
- [x] The link to all settings goes to `/settings`, which ticket 03 draws on the way-in frame.
      *Verified: the same run's first test finds `[data-way-in-all-settings]` with `href="/settings"`.*
- [x] The control is what goes in the surface's `foot`; each way-in screen passes it as it moves onto
      the surface, as tickets 05 to 08 now require. *Verified: the harness draws it in `foot`, and the
      first test finds it under `[data-way-in-foot]`. Corrected: no screen is on the surface until
      05 to 08, so the wiring moved to each of them.*
- [x] The popover takes a step's own acts below the choices, which the wall uses for "use a link"
      and "disconnect this machine" (ticket 05 hands them in). *Verified: the same run, "a step with
      acts of its own lists them below the choices, and nothing else does".*

## Relevant areas

- `apps/desktop/src/lib/design/block/language-choice.svelte`
- `apps/desktop/src/lib/platform/appearance.ts`, the settings area's appearance control
- `packages/design/src/lib/block/way-in-surface.svelte` (`foot`)

## Constraints

- The settings area itself is not changed (spec, *Out of Scope*).

## Notes

*Corrected 2026-10-01 by ticket 01 ([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/evidence/prototypes/the-look-of-the-way-in]]): the wall's two ways out of a jam move into this popover.*

*Corrected 2026-10-01 while building: the control lives in the settings feature, since a layer-1
home cannot import the settings area's appearance control; criteria 5 and 6 were a screen's
wiring, and each screen reaches the surface only in tickets 05 to 08, so they carry it.*
