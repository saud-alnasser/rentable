---
status: resolved
blocked-by: [41]
---

# feat(desktop): the tenant card takes tinted fields

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's word of 2026-10-03: "follow the tinted files and things like that in the reocrds cards of domain data". The tenant card is redrawn in the member card's family: its heading as today, then its facts (national id, phone) and its contracts by status as fields, the name and any badge on the heading, each a `Cell.Field`, in a grid two across; its declared height recomputed and exported. Acts, routes and list behaviour unchanged.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03, and requirements 18 and 19.

- [x] The tenant card test finds its fields as `Cell.Field`s with a glyph, a name and a value, in both locales, with no zero drawn as a figure. *Verified: `vitest run src/lib/tenant` passes: `card.svelte.test.ts` (9) finds national id (ltr), phone and contracts as `Cell.Field`s with glyph, name and value in en and ar, the tint and fixed leading, a chip per non-zero status with its word or a muted *no contracts*, and no zero figure.*
- [x] The directory passes the recomputed height, and its list tests (search, filter, sort, keyboard, selection, acts) pass. *Verified: the same run: the directory's grid lays rows at `TENANT_TILE_HEIGHT` (196); the builder's full run printed node 1484 and vitest 827 passed; check 0 errors.*

## Relevant areas

- `apps/desktop/src/lib/tenant/component/card.svelte` and its tests

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]]; every line at a fixed leading so the declared height holds in Arabic.
