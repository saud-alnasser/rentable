---
status: accepted
load-when: a list's presentation is being chosen or changed
sources: [src/lib/design/block/list.svelte]
supersedes: ["0009"]
superseded-by: []
---

# Each list gets the presentation its data is shaped like, over one shared shell

Supersedes [0009](0009-the-shipping-list-block-is-rewritten-under-a-new-name.md), which
supersedes [0008](0008-one-list-block-replaces-both.md). Both argued one block rendering all
five lists the same way. 0008's reason — that two blocks are why the column vocabulary cannot
be decided once — was voided by 0009 itself, leaving only "one implementation to build and
fix". The block was built (#249) and looked at, and the uniform table does not fit the data:
the five lists are not five of a kind. Payments are an account statement, units are an
occupancy board, contracts are a triage queue, tenants and complexes are directories searched
rather than browsed. So the **mechanism stays single and the presentation becomes per
concept**: one shell owns the query state, the search and its debounce, virtualization, the
empty state, the result count and the create action, and the module that owns the data
supplies a snippet saying what one record looks like.

## Considered Options

**Keep the uniform table** — rejected on looking, which is the only way this could be
rejected. Six contract columns at an 800px window collapse to three, and what survives reads
as a spreadsheet of a triage problem: the thing the user opens the list to do is not
represented anywhere in it.

**Four presentations shipped as blocks in `design/`** — rejected. Consistency by
construction, and the design system would own the vocabulary the way it owns the cell
treatments. But a fifth shape means a fifth block, the configuration objects grow to cover
what a snippet says in markup, and a presentation whose only caller is one concept is
already living in the wrong module.

**A headless controller and four whole components** — rejected. The most freedom per shape
and no prop soup, but the toolbar, the empty state and the loading state get written four
times, and keeping them the same stops being structural and becomes discipline.

## Consequences

**No list is a table.** The table markup, the column fit-and-priority machinery and the
column picker built for #249 have no consumer and come out. Nothing was pushed, so #249's
branch is rewritten rather than reverted.

**The narrow-end increment resolved on #249 is void with the table it governed.** Collapsing
columns by priority with a reader override answered a question — what an overflowing table
does — that no longer has a subject. It stays recorded as answered so the record shows what
was tried; it is not a live rule.

**Decision 03's system rules survive; its per-list column tables do not.** The human handle
leads, a concept carries the same treatment wherever it appears, dropping a field from a
surface never drops it from search, and rows with a detail page navigate on click — all
unchanged. What each list *shows* is now stated per shape rather than as a column order.

**Sorting is intrinsic where the shape has an order.** The queue is ordered by attention
rank, the ledger by date, the board by unit name, and none of the three carries a sort
control; sorting them by an arbitrary key would dissolve the grouping that makes them what
they are. The directories keep decision 03's sortable sets, offered as a control.

**[ADR 0010](0010-lists-load-whole-result-sets.md) is untouched.** One bounded query per
(search, sort) state, nothing re-filtered on the client, is mechanism and holds under every
shape.

**`@tanstack/table-core` is left with one importer, the unimported `data-table` primitive.**
0009 kept that primitive on two arguments; the one that stands is that an unimported file in
`design/primitive/` is the normal state of a generated catalogue. Its other argument — that
regenerating it is unsafe under ADR 0007 — is false, and is recorded as such in
`.claude/evidence/drift/adr-0009-miscites-adr-0007.md`. This decision does not carry it
forward, which is how that finding is consumed.
