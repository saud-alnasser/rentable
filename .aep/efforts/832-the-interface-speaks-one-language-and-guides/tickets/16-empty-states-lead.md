---
status: open
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

- [ ] The list shell distinguishes *nothing here yet* (the concept's words and its create control)
      from *no match* (clear search and filters). Each concept supplies its empty words.
- [ ] The dashboard's empty and the unit panes' hand-built empties use the same block.
- [ ] The record surface's not-found and the unknown route's error page say the record or page
      does not exist, and offer the way back.
- [ ] Component tests for both list states and the not-found.
- [ ] `[[rules/interface]]` gains an *Empty* section.

## Relevant areas

- `apps/desktop/src/lib/design/block/list.svelte:826-887`, `dashboard/component/landing.svelte`,
  `contract/component/unit-pane.svelte:15`, `packages/design/src/lib/block/record-surface.svelte`,
  `routes/+error.svelte`
