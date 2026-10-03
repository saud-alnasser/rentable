---
status: resolved
blocked-by: [15]
---

# feat(desktop): contracts are a grid of cards that name their units

Blocked by: 15

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Contracts draw as tiles wherever they are listed (the directory, a tenant's contracts, a unit's contracts), with the content and height ticket 15 fixed, and each card names the units the contract holds, read through `contract_unit` and gated on unit view.

## Acceptance Criteria

Traces requirements 18 and 19, and criteria 18 and 19 for contracts.

- [x] `contract.getMany` returns the units' names, empty without unit view; its router test covers both. *Verified: `node --test contract/directory/tests/router.test.ts` printed pass 35, fail 0: names in numeric order, `[]` for a contract with none, one row per contract, and the `unitNames` key left off without unit view (absent rather than empty, as `tenantName` and `paymentCount` already are).*
- [x] `contract/component/record.svelte` as a tile: status with its word, every fact with an svg, payments only above zero, the units named. *Verified: integrated on 16 with the card on the shared `Cell.Fact`, `vitest run src/lib/contract` printed 9 files, 40 passed: the labelled status, an svg on every fact, units reading Room 2, Room 10, no payment count at 0 and 1 reading 1 payment.*
- [x] The three surfaces pass `recordMinWidth` and the fixed height; the rank filter and the other list behaviour still pass. *Verified: the same run covers the directory, tenant-contracts and unit-contracts surfaces passing `RECORD_TILE_MIN_WIDTH` and `CONTRACT_TILE_HEIGHT` (184) and the rank filter; desktop `pnpm run check` printed 0 errors.*

## Relevant areas

- `apps/desktop/src/lib/contract/{directory/router.ts,component/record.svelte,component/directory.svelte}`
- `apps/desktop/src/lib/tenant/component/tenant-contracts.svelte`, `apps/desktop/src/lib/complex/unit/component/unit-contracts.svelte`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
- [[rules/data]], under *List reads*: the units are read in the list's own query, not per row.
