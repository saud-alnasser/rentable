---
status: open
blocked-by: []
---

# feat(desktop): a workspace card counts its members without a stack of initials

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-03 ("the workspaces card members showen feels odd (SA) 1 showing each member feels odd"). The workspace card's members field drops the avatar stack: it reads as the other tinted fields do, its glyph, its label and a value saying how many hold it (*no members* where none), so a single initials disc beside a 1 is never drawn. The card keeps its fixed height in both locales.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03, and requirements 16 and 19.

- [ ] The workspace directory test finds no avatar in a card; the members field has its svg, its label and the count words, in both locales.
- [ ] The directory's fixed-height, acts, export and import tests pass.

## Relevant areas

- `apps/desktop/src/lib/organization/workspace/component/directory.svelte`

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]].
