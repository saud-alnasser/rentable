---
status: resolved
blocked-by: []
---

# fix(desktop): what the human's walk found is fixed

## Outcome

At the human's word during ticket 11's walk on 2026-10-01: the foot control holds the language and
the appearance's three buttons alone, with no title above the buttons and no link to all settings;
and the connect step's line under its button is centred with the column.

## Acceptance Criteria

Traces requirements 1 and 7 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 1 and 7.

- [x] The foot control's popover holds the language choice and the appearance's three buttons,
      named for a screen reader, with nothing above them and no link to all settings; on the wall it
      still holds the two acts. A component test finds no `#app-appearance-label`, the appearance
      group's `aria-label`, and no link to `/settings`. *Verified: `way-in-preferences.svelte.test.ts`,
      "the foot names the language, and opens the language and the appearance alone"; the wall's
      acts still pass in `sign-in.svelte.test.ts`; 114 settings, startup and setup tests passed.*
- [x] The settings page's appearance control is unchanged. *Verified: `bare` defaults to false, and the
      settings area draws it without it.*
- [x] `settings.wayIn.allSettings` is gone from both locales and listed as retired. *Verified: the retired
      list holds it, and the i18n node tests pass.*
- [x] The connect step's line under its button is centred. *Verified: `text-center` on
      `[data-setup-connect-hint]`; seen in the walk.*

## Relevant areas

- `apps/desktop/src/lib/settings/component/{way-in-preferences,appearance}.svelte`
- `apps/desktop/src/lib/organization/setup/component/connect-step.svelte`

## Notes

*Appended 2026-10-01 from the human's walk. A change opening the window centred at most of the
screen was built and taken out at the human's word ("the app opens big this is wrong"): the
"quarter of the screen" they first saw was the walk's own 640 by 480 viewport emulation, drawn in
the window's corner, not the window. The walk resizes the window itself since. This ticket
reverses ticket 04's criterion 4 (the link to all settings), and with the link gone the settings
page is no longer reached signed out, which answers the human's note that "ending soon" read
oddly there.*
