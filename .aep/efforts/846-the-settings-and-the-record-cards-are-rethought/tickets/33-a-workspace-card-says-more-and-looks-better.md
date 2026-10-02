---
status: open
blocked-by: []
---

# feat(desktop): a workspace card says more and looks better

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-02: "the workspaces grid card needs to be more informative and better looking". The workspace tile is redrawn as a record card in the tile layout at the same standard as the tenant, complex and contract cards: a glyph tile and the name on its heading with *open on this machine* as a badge, then facts through `Cell.Fact` with their glyphs (the members, shown as a small avatar stack with the count; the reader's access; and what else the workspace read already answers or can derive without a schema change, such as when it was made or its record counts where readable for the open workspace), at a fixed height that holds in Arabic. Its acts stay as they are.

## Acceptance Criteria

Traces requirements 16 and 19, and criteria 16 and 19.

- [ ] The directory test finds on each card its name, the open badge on the open one only, the member avatar stack with its count, the access word, and every fact with an svg; no count of zero.
- [ ] The directory passes `recordMinWidth` and its fixed height; acts, export and import still pass their tests.

## Relevant areas

- `apps/desktop/src/lib/organization/workspace/component/`

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- No schema change.
- Choose components by [[contexts/desktop/components]].
