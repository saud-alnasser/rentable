---
status: resolved
blocked-by: []
---

# fix(design): a settings row carries its own menu

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Review round one, standards. Ticket 23 built the machines card's row menu from `primitive/dropdown-menu` and `primitive/tooltip` by hand, and exported the record card's internals (`recordMenuControl`, `asEntry`, `unavailableEntry`, `unavailableLook`) to do it, against [[contexts/desktop/components]]'s *A block before a primitive*. The row menu becomes a block concern: `block/settings-row.svelte` takes the row's acts and draws the quiet menu control and its entries (refused entries with their reason) itself, sharing what the record card draws through one place inside the design package, so the record card's internals stay private and the machines card draws the block. [[contexts/desktop/components]] names the case (the settings row's menu, one or more entries, a secondary act on a row of a growing list).

## Acceptance Criteria

Traces requirements 2, 10 and 22 as decided 2026-10-02, and criteria 2, 10 and 22, with the components context.

- [x] `machines.svelte` imports no primitive menu or tooltip; it passes the row's acts to `settings-row`. *Verified: `grep -cE 'dropdown-menu|tooltip' machines.svelte` printed 0; the card passes `menu={menuOf(machine, name)}` to `SettingsRow`.*
- [x] `record-card.svelte` exports nothing beyond what it exported before ticket 23, or what it shares lives in one internal module of the design package that both blocks import. *Verified: `git diff 8842531b fdb63350 -- record-card.svelte` adds no export; the shared helpers and menu live in the internal `packages/design/src/lib/record-menu.svelte`.*
- [x] A design component test: a settings row given acts draws a menu control named for the row, its entries, and a refused entry with `aria-disabled` and its reason; the machines and area tests still pass. *Verified: design `vitest run settings-row.svelte.test.ts record-card.svelte.test.ts` printed 18 passed (control named for the row, entries in order, a refused entry with `aria-disabled` and its reason); desktop machines and area tests printed 57 passed.*
- [x] `contexts/desktop/components.md` names the settings row's menu in its dropdown-menu row, its *A block before a primitive* paragraph and its need table; `validate.mjs` passes and the index is regenerated. *Verified: read components.md: the settings row's menu in the dropdown-menu row, *A block before a primitive*, the settings-row row and a new need row; `validate.mjs` printed 569 artifacts checked, no failures.*

## Relevant areas

- `packages/design/src/lib/block/{settings-row,record-card}.svelte`, `apps/desktop/src/lib/organization/session/component/machines.svelte`, `.aep/contexts/desktop/components.md`

## Constraints

- No behaviour change: the menu, its confirmation and its refusal stay as ticket 23 built them.
