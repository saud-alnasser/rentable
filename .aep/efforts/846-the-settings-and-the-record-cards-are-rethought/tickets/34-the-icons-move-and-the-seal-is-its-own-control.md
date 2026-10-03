---
status: resolved
blocked-by: []
---

# feat(desktop): the update and folder icons move, and the seal is its own control

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-02, verbatim: "the icon of update check needs to be rotating with anitmion while checking and the open log the folder icon needs to be look like it opend when clicked with animtion", and "the replace image button of seal; it should be the preview show if clicked it opens file system to replace it". The updates card's icon-only check button turns its `refresh-cw` glyph while a check runs (and stops when it answers); the diagnostics card's icon-only reveal shows a closed folder that opens (`folder` to `folder-open`, with a short transition) when pressed; both follow the motion tokens and do not move under `prefers-reduced-motion` (the glyph state still changes, without animation). The organization's signature or seal card drops its *replace image* button: the preview is itself a button, named for replacing the image, that opens the system's file picker; with no image yet, the same place is an empty preview that chooses one. Remove stays as the card's ending act.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-02, and requirements 5 and 21.

- [x] A test: while a check is pending the check button's glyph carries the spin animation and `aria-busy`, and none once it answers; under reduced motion it carries no animation class. *Verified: `vitest run settings/tests/icon-motion.svelte.test.ts organization/tests/mark.svelte.test.ts`: the check glyph carries the spin and the button `aria-busy` while pending, none once answered, and no animation class under reduced motion.*
- [x] A test: pressing reveal swaps the closed folder for the open one with its transition, and under reduced motion swaps without one; the design package's motion test passes. *Verified: the same run: pressing reveal crosses the closed folder to the open one with its transition, and under reduced motion swaps with none; the design motion test and the desktop motion scan pass.*
- [x] A test: the seal card has no *replace image* button; its preview is a button whose accessible name says it replaces the image and which opens the file picker; with no image the empty preview chooses one; remove is still the confirmed ending act. *Verified: the same run: no replace image button; the preview is a button named replace image (choose image when empty) that opens the picker; remove is still the confirmed ending act.*

## Relevant areas

- `apps/desktop/src/lib/settings/component/{updates,diagnostics}.svelte`, `apps/desktop/src/lib/organization/component/mark.svelte`

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Motion through the repository's motion tokens and its reduced-motion rule ([[rules/interface]]).
- Choose components by [[contexts/desktop/components]].
