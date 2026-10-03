---
status: resolved
blocked-by: []
---

# feat(desktop): members are added to a workspace from one checklist

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-03, verbatim: "option in the workspace members section in the details page of a workspace; the add sheet desgin feels odd first when a member is choosen they just removed from the dropdown added in a free from list yet the dropdown remains; try to find the best way to add a member using the plus even if it's not a sheet try to find the best option". The add sheet of ticket 51 had a search dropdown and, apart from it, a list of the chosen; a chosen member vanished from the dropdown into the other list while the dropdown stayed open. The design call (Apple's *add people* pickers and Contacts' multi-select are the reference; minimal, one place to look): the plus still opens the edge sheet (every write surface is the edge panel), and the sheet holds one list. At its top a search field; below it every member not yet in the workspace, always shown (no dropdown, nothing to open), filtered in place by what is typed, each row the member's glyph or avatar, username and role badge, with a check at the trailing edge. Pressing a row (or Space on it) checks or unchecks it; a checked row stays where it is, marked, so nothing jumps between lists. Rows are a listbox with `aria-multiselectable` (or checkbox rows), arrow keys moving between them. The footer's one button reads *add 1 member* / *add N members* (Arabic plural forms), disabled with none checked; saving grants them in order, closes on success, and on a refusal keeps the sheet open with the reason, those granted gone from the list and the rest still checked. With nobody left to add the sheet says so (and the plus's refusal for a reader who cannot grant stays as ticket 51). The chosen list and the dropdown go.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03, and requirements 2, 16 and 18.

- [x] A sheet test: the list shows every member not in the workspace without opening anything; typing filters it by username in place; with nothing matching it says so; with nobody left it says so. *Verified: add-sheet.svelte.test.ts: every candidate listed in an aria-multiselectable listbox with nothing to open; typing filters in place; no-match and nobody-left empty states*
- [x] A sheet test: pressing a row and pressing Space on it toggle its check, the row staying in the list and in place; arrow keys move between rows; no second list or dropdown exists. *Verified: add-sheet.svelte.test.ts: click and Space toggle a row which stays in place; roving focus with arrows, Home, End; one listbox, no popover or chosen list*
- [x] A sheet test: the button counts the checked in both locales and is disabled at none; save grants each in order and closes; a refusal keeps the sheet with its reason, the granted gone and the rest checked. *Verified: add-sheet and page tests: button counts in en and ar plural forms, disabled at none; save grants in list order through useChangeAccess and closes; refusal keeps the sheet with its reason, granted gone, rest checked*
- [x] Desktop check, node and vitest; design tests; eslint and prettier on changed files; [[rules/interface]] and [[contexts/desktop/components]] describe the checklist; `validate.mjs` passes. *Verified: check 0 errors; node 1485, vitest 879; design 168/164; eslint and prettier clean; interface rule and components context describe the checklist; validate 592 artifacts pass*

## Relevant areas

- `apps/desktop/src/lib/organization/workspace/component/add-sheet.svelte`, `holders.svelte`, the workspace i18n, `packages/design` (a list or command primitive if it fits)

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]].
- No schema change; no change to what the router or Rust allows.
