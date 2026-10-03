---
status: resolved
blocked-by: [15]
---

# feat(desktop): tenants are a grid of cards

Blocked by: 15

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The tenant directory draws tiles in the grid with the content and height ticket 15 fixed: the name, national id and phone with their icons, and a chip per non-zero contract status count with its word.

## Acceptance Criteria

Traces requirements 18 and 19, and criteria 18 and 19 for tenants.

- [x] `tenant/component/card.svelte` has its own test: every fact has an svg, every status chip shows its word, no chip for a zero count, *no contracts* when all are zero. *Verified: `vitest run src/lib/tenant` printed 5 files, 21 passed; `card.svelte.test.ts` finds an svg and `leading-5` on every fact, chips reading `1 defaulted`, `2 active`, `3 fulfilled`, no chip for a zero count, and *no contracts* with its glyph when all are zero.*
- [x] The directory passes `recordMinWidth` and the fixed height; search, filter, sort, selection, transfer menu and empty states still pass their tests. *Verified: the same run: the directory test at width 1000 finds a three-column grid of `data-layout=tile` rows 144 px high; the builder's full desktop run printed 88 files, 711 tests passed, covering search, filter, sort, keyboard, selection, the transfer menu and empty states.*

## Relevant areas

- `apps/desktop/src/lib/tenant/component/{directory,card}.svelte`, `apps/desktop/src/lib/tenant/tests/`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
