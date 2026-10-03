---
status: resolved
blocked-by: []
---

# feat(desktop): the settings cards stand in one column, and only an act is red

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-02 (requirement 1 as revised that day). Every settings tab draws its cards one under the next in a single column, no two-column grid; the cards themselves stay as built. In a card's ending rows only the act's button takes the error tone; the row's glyph and name are neutral, everywhere a settings row ends something (sign out, forget, remove, disconnect, delete). The diagnostics card folds nothing: the log folder's full path is its meta line, and reveal is an icon-only button named by a tooltip (the components context's icon control with its words). The appearance row carries no sentence of explanation under it; the choice explains itself, and *system* says what it follows in its own tooltip.

## Acceptance Criteria

Traces requirement 1 and 2 as revised 2026-10-02, and criteria 1 and 2.

- [x] The area test finds each tab's cards in one column (no two-column grid at any width) in source order. *Verified: integrated on 32, desktop `vitest run` printed 90 files, 765 passed; the area test finds every tab's cards in one column in source order, with no grid columns, container query or spans; the design column test passes (design block tests 123 passed).*
- [x] In every ending row of the area, the row's glyph and name carry no destructive colour and its button does; the design row test pins it. *Verified: the same run: a new area test walks every ending row in all four tabs, finding no destructive class on glyph or name and one red element per row, its button.*
- [x] The diagnostics card has no collapsible; its reveal is an icon button whose accessible name and tooltip say open log folder. *Verified: the same run: diagnostics has no fold or chevron, the whole path is its meta line, and reveal is an icon button whose name and tooltip read open log folder.*
- [x] The general tab shows no explanation sentence under language and appearance; the *system* choice has a tooltip saying what it follows, in both locales. *Verified: the same run: no explanation sentence under language and appearance, and *system* carries a tooltip in en and ar without overwriting its pressed state.*
- [x] Added by the human the same day ("also for the check for updates button needs to be just hte icon and the unkown needs to be not their in the update version"): *check for updates* is an icon button named by its tooltip, and the available-version row draws no *unknown*. *Verified: the same run: check for updates is an icon button with its tooltip, and the available-version row shows no value and no unknown before a check, then 0.15.0 once a check finds it.*
- [x] [[rules/interface]]'s *Settings section* and [[contexts/desktop/components]] say one column and the act-only tone; `validate.mjs` passes. *Verified: read rules/interface *Settings section* (one column, the button alone red, three folding rows, the icon control, no stand-in value) and the components context rows; `validate.mjs` printed no failures; desktop `pnpm run check` 0 errors.*

## Relevant areas

- `packages/design/src/lib/block/{settings-grid,settings-group,settings-row}.svelte`, `apps/desktop/src/lib/settings/component/`, `apps/desktop/src/lib/organization/`

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]].
