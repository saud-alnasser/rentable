---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: spec
status: implemented
---

# Interface overhaul — decisions

Map: [#211](https://github.com/saud-alnasser/rentable/issues/211)

Every decision is answered and the spec it produced is
`ui-overhaul-spec`, since superseded by [[efforts/list-presentation-spec/spec]] for the work that remained. This is the decision document a branch-bound tracker places decision work in, not a spec — the `status` field carries the
spec vocabulary because the directory's index reads it, and `implemented` is what *exited, and
the tickets it produced were built* renders as there.

**The map is #211; this file holds the decisions it is made of.** A ticket in this repository is
one branch carrying one commit that becomes one pull request, and a decision produces no branch —
so decision work lives here as sections, one resolved at a time, each resolution landing as its
own `docs:` commit that writes the answer under `## Answer` and appends a line to the map's
*Decisions so far*. The destination, the notes and the settled decisions live on #211 and are not
repeated here.

Sections are numbered for reference from the map. The numbering changed once, when the Arabic
question dissolved into a standing requirement and the density question split; the closed issues
#212–218 used the old numbers and are not a live reference. Numbers 01 and 02 are absent
deliberately — see below.

## 01 and 02 are build tickets, not decisions

Both were written here as decision sections and neither is one: a decision section resolves a
fork, and these two *record a value*. Recording the performance baseline and transcribing Rhea's
geometry each produce a file, a branch, a commit and a pull request, which is the test for a
ticket in this repository. They were cut as **#219** and **#220** under the map and are worked
through `/implement` rather than here.

The numbers are kept where they were rather than closing the gap, so a reference to decision 03
still means decision 03.

## Carried forward as declared increments

Two decisions are **not** worked here, because neither is answerable from a description. They
attach to the build ticket that first makes them answerable, declared at design time under
`## Declared increments` — **both are now attached**: the first to #246 (the palette), the
second to #249 (the list block):

- **How a surface reads as raised or inset on a black base, with no blur and blue reserved for
  state.** Type: `prototype`. Attaches to the ticket that applies the palette and Rhea's geometry
  to the primitives. Every surface today is separated by `backdrop-filter` plus a double inset
  shadow and all of it is being deleted; border and value alone have to carry the job, and that is
  judged by looking.
  **Resolved 2026-08-04, on #246's built palette:** raised is a one-step-lighter opaque fill under
  `ring-1 ring-foreground/10`, carrying Rhea's surface shadow for its family; **nesting deeper is
  always lighter** — a well sits at `muted`, above its card's value, never below, and a frame that
  merely delineates a scroll region stays at the page value so the rows inside it are the raised
  thing. Blue marks the chosen element and nothing else: a solid `primary` fill where one option
  is active, a `primary` border and ring over a neutral fill where several may be selected at
  once. Judged by looking and accepted as built.
- **What a horizontally overflowing table does at the narrow end of the supported range.** Type:
  `prototype`. Attaches to the ticket that builds the replacement list block. Whether it scrolls,
  collapses columns by priority, or falls back to the card presentation is a question about feel at
  640px, not a rule derivable from the column set.
  **Resolved 2026-08-04, on #249's built block against the contracts set:** it **collapses by
  priority, and the reader can override it**. Every column declares a width, a priority and
  whether it is essential; the block measures itself and keeps columns in priority order while
  the width lasts, the first column that does not fit ending the run so a narrower one further
  down cannot outrank it. An essential column is always shown — a row that has lost the thing it
  names is unreadable rather than shorter — and is not offered in the picker. A column picker
  carries the rest: a column switched on is shown whatever the width says and **does not spend
  the width budget**, so exercising the choice never silently removes a column the reader never
  touched; the table scrolls instead. Below the md breakpoint the card presentation still takes
  over, so the collapse governs the band between md and the width the widest list needs.
  Judged by looking at 800px, where the six-column contracts set collapses to three, and accepted
  as built.

---

## 03 — docs: settle the list column vocabulary

Type: grilling
Blocked by: #220 — how many columns fit a row is a function of row height

### Question

Which columns does each list show, in which order, which of them sort, and what does each list
stop showing?

Decide it for all five lists as one system rather than five independent choices. The same concept
should occupy the same column position and carry the same treatment wherever it appears; deciding
per list is how five lists end up looking like five products.

There is one precedent to read rather than invent, and it is **history rather than a shipping
surface**: a tenant table with national id, name, phone, and an actions column rendered nowhere
from the card-grid overhaul until #225 deleted it. Read it out of git history — it was
`tenant/component/table.svelte` over `design/block/data-table.svelte` — for its column set and
its i18n-wired action shapes, not as evidence of what users see today; every list ships as a card
grid (ADR 0009). Whether that column set survives, and whether its ordering generalizes, is part
of this question rather than an assumption going into it.

A card currently shows about five fields across 360px of vertical space; a row has to choose
fewer. Produces: the column set per list in order; which columns are sortable — sorting on payment
progress is possible only because the aggregates are materialized (ADR 0006); and for each dropped
field, whether it moves to the detail page or disappears.

Known to be the largest of these. If it will not fit one session it splits per list rather than
being rushed.

### Answer

Resolved 2026-08-04, in one session. The field inventory was read from the five data-view
components and the schema at the time of decision; the geometry constraint from the Rhea
transcription ([[efforts/ui-overhaul/evidence/research/rhea-geometry-scale]]): 40px header, ~36px one-line
rows, cells truncate.

**System rules, all five lists:**

- **The human handle leads** — name for complexes, units and tenants; tenant name for contracts.
  Payments have no human handle; the ledger leads with the date.
- **Same concept, same treatment everywhere:** status is a badge in the existing status
  vocabulary; money is localized with the SAR unit; dates are medium-style, UTC; a phone cell
  carries its own direction handling.
- **Sortable means a real SQL column, or an expression over materialized or joined columns, in
  the one bounded list query.** Sorting by status uses the attention rank below, never the enum's
  alphabetical order.
- **Actions:** rows with a detail page (complex, tenant, contract) navigate on row click and carry
  no actions column; rows without one (unit, payment) carry a trailing actions menu with edit and
  delete.
- **Dropping a column never drops the field from search.**

**Per list:**

| List | Columns, in order | Sortable | Default order |
| --- | --- | --- | --- |
| Complexes | name · location · units · vacant | name, units, vacant | name |
| Units | name · status · tenant · until · ⋯ | name, status, until | name |
| Tenants | name · national id · phone · contracts | name, national id, contracts | name |
| Contracts | tenant name · gov id · status · progress (bar + %) · cost / interval · end date | all six; progress by fulfillment ratio | attention order |
| Payments | date · amount · ⋯ | date, amount | date, newest first |

**Attention order** — the contracts list's default sort, one `CASE` in the `ORDER BY`:
`defaulted → active → scheduled → fulfilled → expired → terminated`, end date soonest-first
within each rank. The list opens as a triage board: what needs the user is on top, history at the
bottom.

**What each list stops showing:** the contract's start date, the tenant's phone, and the exact
paid/expected/remaining figures move to the contract detail page; the tenant initials avatar and
the unit card's colored status edge disappear; complexes and payments drop nothing — complexes
gain two columns.

**New data the columns require**, recorded for the spec — every one rides the single list query:

- Complexes: unit count and vacant count as aggregates, replacing today's per-row count query.
- Tenants: an active-contract count aggregate.
- Units: the occupying tenant's name and the contract's end date, via the active-assignment join;
  blank when vacant. The tenant cell links to the tenant.
- Contracts: already carried — the tenant join and the ADR 0006 materialized aggregates.

**Fog this sharpens:** units-as-occupancy-board strengthens the case that a unit stays reachable
through its complex rather than through a top-level list. Noted on the map; not settled here.

---

## 04 — docs: settle the loading and sort model

Type: grilling
Blocked by: —

### Question

How does a list load once the user controls its sort order, and does the one model shipping today
survive it?

**Only one model ships.** All five lists load through `createInfiniteQuery` against an offset
cursor with a fixed order, rendered by a virtualizer. The client-side alternative — load every
row, then sort, filter and paginate in the browser through table-core's row models — rendered
nowhere and was deleted by #225; it was a dead branch, not a competing model (ADR 0009). So this
decides what the replacement does, with no incumbent to defend.

The unbounded read that the dead branch used is still live elsewhere: opening the contract form
still loads every tenant, 542,677 B at 5,000 of them. That is a form question rather than a list
one, and it is recorded in the performance baseline.

User-chosen sort interacts badly with an offset cursor: changing sort mid-stream invalidates every
page already accumulated, so the list either resets to the top, losing the user's position, or
shows rows ordered by two different keys at once.

The pieces for either answer are here — the `pagination` primitive is generated and has no
importers, and virtualization is already working and could render a whole result set without
paging at all. Weigh it against what this application is: no server, a local file, and row counts
bounded by how many properties one person manages. If the conclusion is that the answer suiting a
hosted product with a million rows is wrong here, say so explicitly.

### Answer

Resolved 2026-08-04. **The shipping model does not survive: a list loads the whole result set,
and pagination is retired from the read path** —
[[rules/list-reads]], which carries the reasoning and
the rejected options. The answer the section invited is stated there explicitly: the
hosted-product pattern is wrong for a no-server local file.

What the ADR leaves to this section — the behaviour the replacement block builds to:

- One query per (search, sort) state: `WHERE` from the search, `ORDER BY` from a whitelisted
  per-list sort key. The sortable sets are decision 03's; contracts' no-sort state is the
  attention order.
- A sort or search change re-queries and scrolls to top. The previous result set stays rendered
  until the new one arrives, so a state change never flashes an empty list.
- Search stays SQL-answered per debounced keystroke. The loaded set is never re-filtered,
  re-sorted or re-paginated client-side — the `data-view` block's client-side re-filter over
  accumulated pages does not carry over.
- A result count is available for free (the set's length); whether the block displays it is the
  spec's call.
- The embedded lists (units, payments) use the same model; their per-parent sets are the
  smallest of the five.

What retires with the card grid: `createInfiniteQuery`, the offset cursor, `nextOffset`, page
accumulation, and the load-more intersection observer. The contract form's unbounded tenant
read is a form question, recorded in the baseline, and is not licensed by this answer.

---

## 05 — docs: settle what reconcile does once the aggregates are materialized

Type: grilling
Blocked by: —

### Question

Reconcile loads every contract and every payment, recomputes each status, and issues a per-row
update for each one that changed — on every mutation touching contracts, payments or unit
assignments, and again at startup. Materializing the aggregates (ADR 0006) adds two more
maintained columns to that same pass, which puts reconcile between a save and the interface
responding.

The tension to resolve directly: whole-table reconciliation is *why* the derived state is
trustworthy — it cannot miss a contract whose status changed because time passed rather than
because a row did. An incremental reconcile is fast and can be wrong in exactly that case.

Whatever is chosen must say what happens to a contract that expires while nothing is being edited.
Likely an ADR rather than a paragraph.

### Answer

Resolved 2026-08-04. **Reconcile splits by trigger, never by rule** —
[[rules/reconcile-scope]] carries the decision, the
UTC-day argument that makes the scoped path safe, and the rejected options.

What the ADR leaves to this section — the shape the build tickets work to:

- The ten mutation call sites reconcile the mutation's touch-set only: the contract(s)
  touched, their payments, their assignments, the units those name, and those units' other
  assignments. Status and both ADR 0006 aggregates are written for the touched contracts,
  status for their units.
- The whole-table pass is today's `reconcile` function, kept verbatim, firing at startup,
  on a UTC-day crossing noticed by a periodic check (robust to sleep/wake — it compares the
  current UTC day against the last reconciled one, rather than scheduling a midnight timer),
  and after a remote-sync pull.
- The expiring-while-idle contract: updated at the next day-crossing check while the app is
  open, or at the next startup. The stale window is the check interval.
- The derivation functions are untouched. This decision moves *when and over what rows* they
  run — a build ticket that edits a rule cites the wrong decision.

---

## 06 — docs: settle the query cache policy

Type: grilling
Blocked by: —

### Question

Three things are unset or coarse, each costing a visible round trip: no `staleTime` is configured,
so it defaults to zero and every navigation back to a list refetches it in full; invalidation is
prefix-wide, so one payment edit dumps every cached contract list page and detail row; and every
mutation invalidates and refetches, with nothing updating optimistically.

Settle it across all concepts at once — per-concept policy is how cache behaviour becomes
unpredictable to a user, and an invalidation that spells a key out inline drifts the moment the
key changes.

The context that should drive it: there is no server and no other writer, so cached data is far
more trustworthy here than the library defaults assume. But remote sync can pull in changes made
on another machine, and the policy has to say what happens then.

### Answer

Resolved 2026-08-04. **The cache is trusted until told otherwise** —
[[rules/query-cache]] carries the
policy, the writer-set argument, and the rejected options (finite staleTime, join-graph-targeted
invalidation, optimistic patches).

What the ADR leaves to this section — the shape the build tickets work to:

- `staleTime: Infinity` on workspace data; `retry: false` and `refetchOnWindowFocus: false`
  stay as configured today.
- One shared helper invalidates the five data-concept prefixes; every data mutation calls it.
  The per-domain invalidation helpers that enumerate other concepts' keys inline retire into it.
- The sync pull and the day-crossing reconcile invalidate the root after their full pass —
  the reconcile trigger built by ADR 0011's ticket carries the invalidation with it.
- Invalidate-and-refetch is the only write-back model. No mutation writes the cache directly.

---

## 07 — docs: settle the list presentation per concept

Type: grilling
Blocked by: —

### Question

Should all five lists render the same way?

Raised 2026-08-04 by the human, after #249 built the table-first block and it was looked at
against real contracts: the interface "feels not customed to the data we have, not intuitive".
The uniform block is ADR 0009's,
inherited from 0008 — and 0008's stated reason for it, that the column vocabulary cannot be
decided once with two blocks, was already voided by 0009. So the question is what is left
holding uniformity up, and whether it survives contact with what each list is actually for.

### Answer

Resolved 2026-08-04. **Mechanism stays single, presentation goes per concept** —
[[rules/list-presentation]] carries the decision and the
rejected shapes. What that section leaves to this one:

**The shapes, one per concept:**

| List | Shape | What it is for | Order |
| --- | --- | --- | --- |
| Contracts | triage queue, grouped by attention rank | what needs the user today | attention rank, fixed |
| Payments | ledger, date-grouped, amount trailing, running balance | an account statement for one contract | date, newest first, fixed |
| Units | occupancy board, tiles by status carrying the tenant | who is in what, at a glance | unit name, fixed |
| Tenants | directory rows — handle, then secondary facts | search, then pick one | sort control: name · national id · contracts |
| Complexes | directory rows | same | sort control: name · units · vacant |

**The seam.** One shell in `design/block/` owns the query state, the search input and its
debounce, the result count, the create action, the empty and loading states, the scroll
container, virtualization, and group headers where a shape has groups. Each concept supplies a
snippet for one record, in its own module. Three of the four shapes are rows with optional
groups, so one shell covers them; the board is a grid of tiles rendered inside a single group.

**What this retires.** No list is a table, so the table markup, the column fit-and-priority
machinery and the column picker have no consumer. The narrow-end increment declared on #249
and resolved earlier the same day — collapse by priority with a reader override — is void with
the table it governed; it stays recorded above as answered, and is not a live rule.

**What survives from 03.** Its system rules, unchanged: the human handle leads, a concept
carries the same treatment everywhere, sortable means a real SQL column in the one bounded
query, rows with a detail page navigate on click and carry no actions column, and dropping a
field from a surface never drops it from search. Its per-list column tables are superseded by
the shapes above.

**Drift consumed.** A finding that ADR 0009 cited ADR 0007 for a claim it does not make
was waiting on this decision's subject. 0009 is superseded, and 0013 does not carry the false
citation forward.

---

## Leaving the map

The map is done when 03 through 06 are answered and the two increments above are attached to the
tickets that will carry them. #219 and #220 are already tickets and do not gate the map, though
#220 gates decision 03. `/design` then returns to write the spec and cut the remaining build
tickets — and those *are* tickets, because each one becomes a branch.

**Re-entered 2026-08-04**, after #243–#249 were built, for decision 07 above: the uniform list
presentation did not survive being looked at. The map is exited again on 07's answer, and the
spec it produced is superseded by
[[efforts/list-presentation-spec/spec]] for the work that remains.

**Exited 2026-08-04.** All four decisions answered, the spec accepted at
`ui-overhaul-spec`, and the twelve build tickets cut as #243–#254
under the map, increments attached to #246 and #249. The complex → unit path was settled on
the way out (units stay under their complex — the occupancy board makes a top-level list a
duplicate). The dashboard's content and the contract form's internal layout remain on the
map's *Not yet specified*, each a later design session.
