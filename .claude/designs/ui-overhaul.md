# Interface overhaul — decisions

Status: mapping
Map: [#211](https://github.com/saud-alnasser/rentable/issues/211)
Sources: `src/lib/design/block/`, `src/lib/design/primitive/`, `src/lib/layout/`, `src/routes/`,
`src/app.css`, `src/lib/contract/router.ts`, `src/lib/contract/serialize.ts`,
`src/lib/contract/reconcile.ts`, `tauri/tauri.conf.json`

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
`## Declared increments`:

- **How a surface reads as raised or inset on a black base, with no blur and blue reserved for
  state.** Type: `prototype`. Attaches to the ticket that applies the palette and Rhea's geometry
  to the primitives. Every surface today is separated by `backdrop-filter` plus a double inset
  shadow and all of it is being deleted; border and value alone have to carry the job, and that is
  judged by looking.
- **What a horizontally overflowing table does at the narrow end of the supported range.** Type:
  `prototype`. Attaches to the ticket that builds the replacement list block. Whether it scrolls,
  collapses columns by priority, or falls back to the card presentation is a question about feel at
  640px, not a rule derivable from the column set.

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

---

## Leaving the map

The map is done when 03 through 06 are answered and the two increments above are attached to the
tickets that will carry them. #219 and #220 are already tickets and do not gate the map, though
#220 gates decision 03. `/design` then returns to write the spec and cut the remaining build
tickets — and those *are* tickets, because each one becomes a branch.
