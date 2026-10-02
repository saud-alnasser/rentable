---
status: resolved
blocked-by: [41]
---

# feat(desktop): the workspace card takes tinted fields

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's word of 2026-10-03: "follow the tinted files and things like that in the reocrds cards of domain data". The workspace card is redrawn in the member card's family: its heading as today, then its members (with the initials), the reader's access and when it was made as fields, the open badge on the heading, each a `Cell.Field`, in a grid two across; its declared height recomputed and exported. Acts, routes and list behaviour unchanged.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03, and requirements 18 and 19.

- [x] The workspace card test finds its fields as `Cell.Field`s with a glyph, a name and a value, in both locales, with no zero drawn as a figure. *Verified: integrated on 42 and 43, `vitest run src/lib/organization src/lib/tenant src/lib/complex` printed 36 files, 449 passed; the workspace directory test finds members (initials then the figure, or a muted nobody), your access and created as `Cell.Field`s with glyph, name and value in en and ar, and no zero figure.*
- [x] The directory passes the recomputed height, and its list tests (search, filter, sort, keyboard, selection, acts) pass. *Verified: the same run: the directory lays each row at `WORKSPACE_TILE_HEIGHT` (196) in both languages; columns, search, sort, acts, export and import pass; check 0 errors.*

## Relevant areas

- `apps/desktop/src/lib/organization/workspace/component/directory.svelte` and its tests

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]]; every line at a fixed leading so the declared height holds in Arabic.
