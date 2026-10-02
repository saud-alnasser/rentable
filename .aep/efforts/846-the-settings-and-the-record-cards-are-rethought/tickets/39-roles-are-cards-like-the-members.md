---
status: resolved
blocked-by: []
---

# feat(desktop): roles are cards like the members, in their order

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-02 ("also i like that the roles are orderd cards but the looks of them and not using icons feels odd they should match the cards that use icons ad badges like the members card"). The roles directory keeps its rank order and draws each role as a card matching the member card (ticket 37): a glyph tile (`shield`) and the role's name on the heading with a badge counting who holds it, then tinted fields with glyphs for what the role can do (what it may change, what it may read, the people acts it holds, how many members), at a fixed height that holds in Arabic, in the list's grid in rank order. Its acts and sheet stay as they are.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-02, and requirement 19.

- [x] A role card test: glyph tile, name, holders badge, every field with an svg, a label and a value, in both locales; no zero drawn as a figure. *Verified: integrated on 37, desktop `vitest run` printed 92 files, 789 passed; `role/tests/card.svelte.test.ts` finds the shield tile, name, holders badge, and four fields (reads, changes, people, organization) each with an svg, a label and a value in en and ar, with no zero figure; the fields carry the member card's classes.*
- [x] The roles directory passes its fixed height and lays the cards in rank order; search, sort, acts and sheet tests pass. *Verified: the same run: the roles directory lays the cards in the grid in rank order at `ROLE_TILE_HEIGHT` (196); search, sort, acts and sheet tests pass; node tests 1489 passed; check 0 errors.*

## Relevant areas

- `apps/desktop/src/lib/organization/role/component/`

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Match the member card's look ([[contexts/desktop/components]]).
