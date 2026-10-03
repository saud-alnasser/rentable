---
status: open
blocked-by: []
---

# feat(desktop): the organization stamp sits beside its name, its controls drawn with care

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-03, verbatim: "the delete and add image in orgnization stamp feels ood the image neexsc on the righrt side no need to be under; and the button of delete and add a littilbe bit needs to be worked on; the workspaces card members showen feels odd (SA) 1 showing each member feels odd; also manage members in the workspaces the form looks bad the switch it needs to be a better looking maybe a page details like how records have pages record and dicreocty of members and at the top information". (1) The stamp card's image row lays as every other settings row does: the glyph and name at the start, the preview at the trailing edge (mirrored in Arabic) on the same line, never wrapped beneath the name at any width the settings column takes. (2) The replace and remove controls on the preview are reworked so they read as deliberate, not stuck on: consistent in size and shape with each other, aligned to the preview's corners within its bounds or on a quiet overlay that shows on hover and focus (always reachable by keyboard and visible to touch), replace keeping its tooltip with the preview still the control, and remove red on the button alone, confirmed as today. Make the call the way a careful designer would (Apple's photo and avatar editors are the reference), minimal and clear.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03, and requirements 2 and 5.

- [ ] A test: the image row's preview sits in the row's trailing value slot on the name's line (the row does not stack), in both locales.
- [ ] A test: replace and remove are each named by label and tooltip and reachable by keyboard, remove red on itself alone and opening the confirmation; with no stamp there is no remove; pressing the preview still opens the picker.
- [ ] The commit body says how the two controls are drawn and why.

## Relevant areas

- `apps/desktop/src/lib/organization/component/mark.svelte`, `packages/design/src/lib/block/settings-row.svelte` if the row's value slot needs it

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]].
