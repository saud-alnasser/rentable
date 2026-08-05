---
status: superseded
load-when: the history of how the list block reached its present shape is in question
sources: [src/lib/design/block/]
supersedes: ["0008"]
superseded-by: ["0013"]
---

# The shipping list block is rewritten under a new name, and the dead one is deleted

Supersedes [0008](0008-one-list-block-replaces-both.md), which reached the right outcome from a
premise that was false in both halves. Only one list block ships: `design/block/data-view.svelte`
renders a virtualized card grid over an infinite query for **all five** lists — complexes, units,
contracts, payments and tenants. `design/block/data-table.svelte` renders none. Its only importer
is `tenant/component/table.svelte`, and that file has had no importers since the tenants route
moved to the card grid; it survived two later relocation refactors, which moved it without
noticing nothing rendered it. So `data-view` is replaced by a new block composing
`@tanstack/table-core`'s column model with virtualization over a server-driven query, and
`data-table` and its orphaned wrapper are deleted as dead code rather than "retired".

## Considered Options

**Evolve `data-view` in place** — rejected, and this is now the only argument for a new file, so it
carries the decision alone. Its data layer is the right one, but the replacement changes the search
from a client-side substring match over accumulated pages to a server-answered query, changes the
virtualization from a fixed card height to variable rows, and changes the ordering from fixed to
user-chosen. What would survive is the filename. A rewrite that keeps the name cannot be diffed
against what it replaced, and this is the change where that diff matters most, because every list
moves at once.

**Keep `data-table` as a reference in the tree until the switch-over** — rejected. It is code that
already misled one accepted decision, and the map's open column-vocabulary question points at it as
precedent. Deleting it now removes the trap before that question is worked; git history is where
0008 already said the retired files would live.

## Consequences

**0008's central claim that the column vocabulary cannot be decided once is void**, and nothing
replaces it. There has only ever been one live block, so the vocabulary has one home and always
did. Whoever works the column-vocabulary decision must read the tenant table as **history**, not as
a shipping precedent — its column set was last rendered before the card-grid overhaul.

All five lists regress together, which is what makes the switch-over the riskiest ticket in the
effort and why the performance baseline was recorded first. The count is five, not the four 0008
stated.

The deleted files stay readable in history and remain the reference for what the replacement keeps:
`data-view`'s debounce, overscan and threshold values were arrived at against real data, and
`data-table`'s column, action and selection shapes are wired to the i18n store. Neither set is
re-derived from scratch.

`@tanstack/table-core` stays a dependency for its column model. Its row models — core, sorting,
filtering and pagination — are imported by exactly one file, the deleted block, so the switch-over
starts from no client-side row model rather than from one it has to dismantle.

**The `data-table` primitive stays, and is deliberately left with no importers.** Its two importers
are both files this decision deletes, so `design/primitive/data-table/` becomes unimported — but
that is the normal state of a primitive here, not a second orphan. `design/primitive/` is a
generated catalogue owned since generation, and `empty` and `pagination` already sit in it unused;
it is `design/block/` and a concept's own components where an unimported file means dead code. The
primitive wraps table-core into `createSvelteTable` and `FlexRender`, which is exactly what the
replacement needs, so deleting it would mean regenerating it — and regeneration is what ADR 0007
established this repository cannot safely do.
