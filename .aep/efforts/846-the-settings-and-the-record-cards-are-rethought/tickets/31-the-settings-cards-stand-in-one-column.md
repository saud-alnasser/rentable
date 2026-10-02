---
status: open
blocked-by: []
---

# feat(desktop): the settings cards stand in one column, and only an act is red

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-02 (requirement 1 as revised that day). Every settings tab draws its cards one under the next in a single column, no two-column grid; the cards themselves stay as built. In a card's ending rows only the act's button takes the error tone; the row's glyph and name are neutral, everywhere a settings row ends something (sign out, forget, remove, disconnect, delete). The diagnostics card folds nothing: the log folder's full path is its meta line, and reveal is an icon-only button named by a tooltip (the components context's icon control with its words). The appearance row carries no sentence of explanation under it; the choice explains itself, and *system* says what it follows in its own tooltip.

## Acceptance Criteria

Traces requirement 1 and 2 as revised 2026-10-02, and criteria 1 and 2.

- [ ] The area test finds each tab's cards in one column (no two-column grid at any width) in source order.
- [ ] In every ending row of the area, the row's glyph and name carry no destructive colour and its button does; the design row test pins it.
- [ ] The diagnostics card has no collapsible; its reveal is an icon button whose accessible name and tooltip say open log folder.
- [ ] The general tab shows no explanation sentence under language and appearance; the *system* choice has a tooltip saying what it follows, in both locales.
- [ ] [[rules/interface]]'s *Settings section* and [[contexts/desktop/components]] say one column and the act-only tone; `validate.mjs` passes.

## Relevant areas

- `packages/design/src/lib/block/{settings-grid,settings-group,settings-row}.svelte`, `apps/desktop/src/lib/settings/component/`, `apps/desktop/src/lib/organization/`

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]].
