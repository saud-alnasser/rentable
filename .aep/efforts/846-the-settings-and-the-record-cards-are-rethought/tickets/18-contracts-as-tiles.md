---
status: open
blocked-by: [15]
---

# feat(desktop): contracts are a grid of cards that name their units

Blocked by: 15

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Contracts draw as tiles wherever they are listed (the directory, a tenant's contracts, a unit's contracts), with the content and height ticket 15 fixed, and each card names the units the contract holds, read through `contract_unit` and gated on unit view.

## Acceptance Criteria

Traces requirements 18 and 19, and criteria 18 and 19 for contracts.

- [ ] `contract.getMany` returns the units' names, empty without unit view; its router test covers both.
- [ ] `contract/component/record.svelte` as a tile: status with its word, every fact with an svg, payments only above zero, the units named.
- [ ] The three surfaces pass `recordMinWidth` and the fixed height; the rank filter and the other list behaviour still pass.

## Relevant areas

- `apps/desktop/src/lib/contract/{directory/router.ts,component/record.svelte,component/directory.svelte}`
- `apps/desktop/src/lib/tenant/component/tenant-contracts.svelte`, `apps/desktop/src/lib/complex/unit/component/unit-contracts.svelte`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
- [[rules/data]], under *List reads*: the units are read in the list's own query, not per row.
