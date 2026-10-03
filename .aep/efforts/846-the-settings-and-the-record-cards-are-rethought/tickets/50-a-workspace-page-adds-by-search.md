---
status: open
blocked-by: []
---

# feat(desktop): a workspace page adds a member by search and shows its members as cards

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-03, verbatim: "the details page of a workspace in the settings it should have a record search bar or feild that you search for a member then add them to the worksace and a grid of cards sohwen to existing members and have elipses as action for them regarding the workspace". The workspace page (ticket 49) drops its list of switches. (1) Under the header, a search field in the record directories' manner (the same search control the members and record directories use, or a combobox the components context names) finds members who can hold the workspace and are not in it, by username; choosing one adds them at once through the same grant mutation, refused with its reason as today (a reader without `grantWorkspace`, or holding it read only, gets the field refused or absent with the reason said). With nobody left to add, the field says so. (2) Below, the members in the workspace as a grid of member cards in the members directory's look (the member card's glyph tile or avatar, username, role badge, tinted fields; reuse the member card component if it fits, at its fixed height, `columnsFor` and `RECORD_TILE_MIN_WIDTH`), with the *custom here* mark where tailored and an empty state when nobody holds it. (3) Each card carries the ellipsis record menu (`RecordMenu`) with the acts that concern this workspace: *remove from workspace* (red, confirmed, since it ends access: ticket 40's rule), *tailor access here* (opening that member's tailoring for this workspace where it lives today), and *open member* (their sheet or card in the members section); each refused with its reason as the router would. The owner and the reader are not cards here, as today.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03, and requirements 2, 16, 18 and 19.

- [ ] A page test: the search field lists only members who can hold the workspace and are not in it, filters by username, and choosing one grants through the access mutation; a refused grant says its reason; a reader who cannot grant meets no usable field and the reason; with none left to add it says so; in both locales.
- [ ] A page test: the holders render as a grid of member cards (fixed height, `recordMinWidth`) with username, role badge and tinted fields, *custom here* on the tailored, and an empty state with no holders; no switch remains on the page.
- [ ] A page test: each card's ellipsis menu holds remove from workspace (red, confirmed before it withdraws), tailor access here and open member, each refused with its reason where the reader may not; the dangerous-acts guard passes.
- [ ] Desktop check, node and vitest; design tests; eslint and prettier on changed files.
- [ ] [[rules/interface]] and [[contexts/desktop/components]] say the page adds by search and lists members as cards with a menu; `validate.mjs` passes.

## Relevant areas

- `apps/desktop/src/lib/organization/workspace/component/{page,holders}.svelte`, `apps/desktop/src/lib/organization/member/component/` (the member card), the search control the directories use

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]].
- No schema change; no change to what the router or Rust allows.
