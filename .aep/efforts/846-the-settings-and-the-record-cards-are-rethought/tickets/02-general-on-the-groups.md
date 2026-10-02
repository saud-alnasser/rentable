---
status: resolved
blocked-by: [01]
---

# feat(desktop): the general section reads as grouped rows

Blocked by: 01

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

General is drawn as three groups on the shared blocks: language and appearance, updates, diagnostics, each row with its icon, as the plan's mapping table gives them. Updates and diagnostics use labelled buttons with icons instead of icon-only chips. Ending soon stays where it is until ticket 10 moves it. The page's loading skeleton takes the grouped shape.

## Acceptance Criteria

Traces requirements 1, 4 and 5, and criteria 1, 4 and 5 for the general section.

- [x] Every row in general has an icon and a name (`app/tests/settings-area.svelte.test.ts`). *Verified: integrated on 07, `vitest run app/tests/settings-area.svelte.test.ts src/lib/settings src/lib/organization/workspace` printed 9 files, 103 tests passed; the area test finds five rows in general, each with an svg and a name.*
- [x] Within each group in general, every button carries an svg or none does. *Verified: the same area test: every button-role element in each general group carries an svg or none does (the language and appearance radios are segments, not buttons).*
- [x] With `api.settings.set` rejected, choosing another language or appearance puts the old one back and the shared handler says why. *Verified: two tests in `settings/tests/page.svelte.test.ts` (in the 103): the toast reads `common.errors.io`, the language returns to `en`, the dark class is gone and light is pressed again.*
- [x] No button in general is named *save* other than ending soon's, which ticket 10 removes. *Verified: the area test (in the 103) finds no button named save in general other than ending soon's.*
- [x] `settings/component/page.svelte`'s skeleton draws grouped rows. *Verified: the page test with fake timers (in the 103) finds the skeleton drawn as groups of rows; desktop `pnpm run check` over the integrated tree printed 0 errors, 0 warnings.*

## Relevant areas

- `apps/desktop/src/lib/settings/component/{area,page,locale,appearance,updates,diagnostics}.svelte`
- `apps/desktop/src/lib/settings/i18n/{en,ar}.ts`
- `apps/desktop/src/lib/app/tests/settings-area.svelte.test.ts`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
- The two description lines of language and appearance become the group's one footer line, in both locales.
