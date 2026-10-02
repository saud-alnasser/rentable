---
status: open
blocked-by: [15]
---

# feat(desktop): tenants are a grid of cards

Blocked by: 15

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The tenant directory draws tiles in the grid with the content and height ticket 15 fixed: the name, national id and phone with their icons, and a chip per non-zero contract status count with its word.

## Acceptance Criteria

Traces requirements 18 and 19, and criteria 18 and 19 for tenants.

- [ ] `tenant/component/card.svelte` has its own test: every fact has an svg, every status chip shows its word, no chip for a zero count, *no contracts* when all are zero.
- [ ] The directory passes `recordMinWidth` and the fixed height; search, filter, sort, selection, transfer menu and empty states still pass their tests.

## Relevant areas

- `apps/desktop/src/lib/tenant/component/{directory,card}.svelte`, `apps/desktop/src/lib/tenant/tests/`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
