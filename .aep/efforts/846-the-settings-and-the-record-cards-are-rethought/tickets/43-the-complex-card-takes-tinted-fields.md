---
status: resolved
blocked-by: [41]
---

# feat(desktop): the complex card takes tinted fields

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's word of 2026-10-03: "follow the tinted files and things like that in the reocrds cards of domain data". The complex card is redrawn in the member card's family: its heading as today, then its location, units, occupied and vacant as fields (a count of zero said in words, muted), each a `Cell.Field`, in a grid two across; its declared height recomputed and exported. Acts, routes and list behaviour unchanged.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03, and requirements 18 and 19.

- [x] The complex card test finds its fields as `Cell.Field`s with a glyph, a name and a value, in both locales, with no zero drawn as a figure. *Verified: `vitest run src/lib/complex` passes: the card test finds location, units, occupied (its status glyph and tone) and vacant as `Cell.Field`s with glyph, name and value in en and ar, a zero as a muted none, never a figure; a reader without unit view sees location alone.*
- [x] The directory passes the recomputed height, and its list tests (search, filter, sort, keyboard, selection, acts) pass. *Verified: the same run: the directory lays each row at `COMPLEX_TILE_HEIGHT` (196); the builder's full desktop run printed 95 files, 825 passed; check 0 errors.*

## Relevant areas

- `apps/desktop/src/lib/complex/component/card.svelte` and its tests

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]]; every line at a fixed leading so the declared height holds in Arabic.
