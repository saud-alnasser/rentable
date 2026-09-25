---
status: resolved
blocked-by: [12]
---

# feat(desktop): empty states say what comes next

## Outcome

An empty set says what it will hold and offers its create act. A search or filter with no match
says so and offers to clear it. The two never read the same, and a missing record says it is gone
rather than "no results".

## Acceptance Criteria

Traces requirements 6 and 13 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criterion 13.

- [x] The list shell distinguishes *nothing here yet* (the concept's words and its create control)
      from *no match* (clear search and filters). Each concept supplies its empty words. Verified: `list.svelte` draws `block/empty.svelte`: no match offers clearing search, filters or both; nothing yet shows the concept's required `emptyTitle` (en, ar) and its create; `list-empty.svelte.test.ts` passes within desktop vitest 311 of 311 on the merged tree.
- [x] The dashboard's empty and the unit panes' hand-built empties use the same block. Verified: the dashboard and the contract unit panes draw the same block (unit panes also get no match); `pnpm check` 0 errors.
- [x] The record surface's not-found and the unknown route's error page say the record or page
      does not exist, and offer the way back. Verified: the record surface's not-found says the record does not exist and offers go back; `+error.svelte` says the page does not exist on a 404 and keeps go to dashboard; record-surface tests pass (design vitest 101 of 101).
- [x] Component tests for both list states and the not-found. Verified: `list-empty.svelte.test.ts`, `empty.svelte.test.ts` and two record-surface not-found tests pass on the merged tree.
- [x] `[[rules/interface]]` gains an *Empty* section.
 Verified: `rules/interface.md` gains *Empty*; validate.mjs no failures.
## Relevant areas

- `apps/desktop/src/lib/design/block/list.svelte:826-887`, `dashboard/component/landing.svelte`,
  `contract/component/unit-pane.svelte:15`, `packages/design/src/lib/block/record-surface.svelte`,
  `routes/+error.svelte`
