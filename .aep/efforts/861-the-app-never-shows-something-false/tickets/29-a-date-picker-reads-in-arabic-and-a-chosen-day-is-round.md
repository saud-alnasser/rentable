---
status: resolved
---

# fix(design): a date picker names each weekday in Arabic, and a chosen day is round at the edges

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (the effort's premise: the app never shows something false; requirement 9's selected day). Found while staging ticket 01's check (ticket 28).

## Outcome

Every date picker's weekday header names each day in both languages, and a chosen day in the first or last column of a week is the same circle as any other.

## Acceptance Criteria

Traces requirement 9.

- [x] In Arabic the header reads one distinct letter per weekday, and in English one per weekday as the system pickers do. Verified: the staged end-date picker reads ح ن ث ر خ ج س under Arabic and M T W T F S S under English; before, every Arabic column read ال, since the header sliced the short name, which in Arabic is the whole word, to two characters.
- [x] A chosen day on the week's edge is a full circle. Verified: the staged end-date picker's chosen 31, on the edge in both directions, is round in en and ar; the cell no longer rounds a selected day's outer side for a range calendar the app does not have. `pnpm check`, `pnpm lint` and `pnpm test` in packages/design pass (212 tests).

## Relevant areas

- packages/design/src/lib/primitive/calendar/calendar.svelte, calendar-cell.svelte

## Constraints

- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes

- Fixed in 06f9b266.
