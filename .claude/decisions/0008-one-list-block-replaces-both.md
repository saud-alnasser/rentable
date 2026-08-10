---
owner: repository
status: superseded
load-when: the history of how the list block reached its present shape is in question
sources: [src/lib/design/block/]
supersedes: []
superseded-by: ["0009"]
---

# Both list blocks are replaced by one server-driven table

Two list implementations ship today and neither is what the rebuild needs.
`design/block/data-view.svelte` renders a virtualized card grid over an infinite query with
debounced search, and four lists use it; `design/block/data-table.svelte` renders a table over
`@tanstack/table-core` with client-side sort, filter and pagination row models, and the tenant
list uses it through a plain `createQuery` that loads every row. One has the right data layer
and the wrong presentation; the other has the right presentation and the data layer the
destination explicitly forbids. Both are replaced by a single block that composes table-core's
column model with virtualization over a server-driven query, and each is read for the parts it
got right rather than extended.

## Considered Options

**Extend `data-table`** — rejected. Its three client-side row models are precisely what has to
go, it has no virtualization and no incremental loading, and what would survive the rewrite is
the column vocabulary alone. Keeping the file would preserve the half that must be discarded
while re-adding the half that already exists elsewhere.

**Re-render `data-view` as a table** — rejected, though it is the smaller diff. Its data layer
is correct, but its search is a client-side substring match over accumulated pages and its
virtualization is tuned to a fixed card height; a table's variable rows and server-driven
ordering reach far enough into it that the result is a rewrite wearing the old file's name. A
rewrite that keeps the name loses the ability to diff against what was replaced.

**Keep both** — rejected. Two blocks are why the column vocabulary cannot be decided once: the
same concept renders through different mechanisms on different pages, and a decision about
columns has to be made twice and kept in agreement forever.

## Consequences

Every list regresses at once rather than one at a time, which makes the switch-over ticket the
riskiest in the effort and is why the performance baseline is recorded before it.

The two retired files stay readable in history and are the reference for what the replacement
has to keep: `data-view`'s debounce, overscan and threshold values were arrived at against real
data, and `data-table`'s column, action and selection shapes are already wired to the i18n
store. Neither set is re-derived from scratch.

`@tanstack/table-core` stays a dependency for its column model. Its row models — sorting,
filtering, pagination — do not survive, because the query answers all three.
