---
status: resolved
blocked-by: []
---

# feat(desktop): members are a grid of cards that say more

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-02: "the members grid record needs to be a grid of 3 columns or 2 like the other records shows more data better". The organization tab's members directory lays its members as tiles in the list's grid (`columnsFor`, `RECORD_TILE_MIN_WIDTH`, up to three across), each a record card in the tile layout with its avatar, username, role badge and the facts a member has (whether a password is set, how many machines are signed in, how many workspaces they hold, and anything else the member read already answers), each fact with its glyph through `Cell.Fact`, at a fixed height that holds in Arabic. The member's acts and its sheet stay as they are. The roles directory keeps its rows.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-02, and requirements 18 and 19.

- [x] A member card test: avatar, username, role badge, and every fact with an svg and its word; no count of zero. *Verified: `vitest run organization/member app/tests/settings-area.svelte.test.ts` printed 6 files, 175 passed; `member/tests/card.svelte.test.ts` finds the avatar, username, role badge, every fact with its svg and word (password, signed in or not, workspaces, joined), no zero drawn, and the Arabic forms for 1, 2, 3, 11, 100. The read answers whether a member is signed in, not how many machines, so the card says signed in or not (a count needs a roster change the ticket rules out).*
- [x] The members directory passes `recordMinWidth` and its fixed height; at width 1000 it lays three across; its search, sort, selection, acts and sheet still pass their tests. *Verified: the same run: the grid test at width 1000 finds three columns at `RECORD_TILE_MIN_WIDTH` and `MEMBER_TILE_HEIGHT` (188); search, sort, selection, acts and sheet tests pass.*

## Relevant areas

- `apps/desktop/src/lib/organization/member/component/`

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Read only what the member read already answers, or add a field the router can derive without a schema change.
- Choose components by [[contexts/desktop/components]].
