---
status: implemented
---

# feat: give each list the presentation its data is shaped like

Supersedes the earlier `ui-overhaul-spec` for the work that remains. Its data
layer (#243–#245) and its shell (#246–#248) are built and are not revisited; what changes is
the presentation half, on [[rules/interface]], under *List presentation*
and decision 07 of [[efforts/ui-overhaul/spec]].

## Problem

Five lists render as one card grid, and the replacement built for them renders as one table.
Neither fits what the lists are for. A contract list is the day's work — what has defaulted,
what is running, what has not started — and a table of six columns states none of that;
sorted or not, it reads as records to browse. Payments are an account statement rendered as
cards. Units answer "who is in what" and answer it six tiles at a time. Tenants and complexes
are directories, and a directory is the one case a table nearly fits — nearly, because the
narrow end of the supported range then needs a column-collapse machinery that exists for no
other reason.

## Goal

Each list is the shape its data already has, and the machinery underneath all of them is one
thing: the same query model, search, virtualization, empty state and result count, whatever
is rendered on top.

## Constraints

- **[[rules/data]], under *List reads*, holds unchanged.** One
  bounded query per (search, sort) state; nothing re-filtered, re-sorted or re-paginated on
  the client. It is mechanism and survives every shape.
- **Decision 03's system rules hold**; its per-list column tables do not (decision 07).
- **Arabic is first-class.** Every shape ships working in both directions, and three of the
  four are new layouts rather than restyled ones.
- Supported window range 640×480 upward, and the collapse machinery that used to serve the
  narrow end is being deleted — each shape has to hold at 640px on its own.
- **The generated primitives stay a permanent fork** (ADR 0007),
  with the transcription's deviations applied by whichever ticket touches a family.

## Architecture

**One shell, four presentations.** `design/block/` holds the shell: it takes the whole result
set and owns the search input and its debounce, the result count, the create action, the
empty and loading states, the scroll container, virtualization, and group headers for the
shapes that group. It renders one snippet per record, supplied by the module that owns the
data — so a presentation lives with its concept, not in the design system.

`design/cell/` keeps the treatments every shape shares: status as a badge whose variant is
fixed by meaning, money localized with the currency, dates medium-style in UTC, phone held
`ltr`. Those are already built.

The seam is the snippet boundary: everything above it is the same for five lists, everything
below it is that concept's own. What crosses it is one record and, for a grouped shape, the
group it belongs to.

## Approach

The shell first, because four tickets consume it, then one concept at a time — each landing
green while the card grid still serves the lists that have not moved. The riskiest is the
contract queue: it is the only shape whose grouping the query has to produce, and it is the
list the whole rethink started from, so it goes first among the four and its grouping is a
declared increment rather than a guess.

Rejected shapes are in ADR 0013 and are not re-proposed here.

### The tickets

| # | Ticket | Blocked by | Carries |
| --- | --- | --- | --- |
| #249 | feat: build the list shell | — | rewritten in place; table, column fit and picker come out |
| #250 | feat: move contracts to the triage queue | #249 | attention-rank grouping in SQL; increment: what a group header carries (`prototype`) |
| #251 | feat: move tenants to the directory list | #249 | active-contract count aggregate; the sort control |
| #252 | feat: move the property lists to their own shapes | #249 | complexes as directory rows; units as the occupancy board; unit/vacant aggregates |
| #253 | feat: move payments to the ledger | #249 | date grouping and the running balance against the contract's expected total |
| #254 | refactor: delete the card grid block | #250, #251, #252, #253 | the contract step, unchanged |

## Acceptance criteria

- Every list issues one bounded query per (search, sort) state, and nothing re-filters,
  re-sorts or re-paginates the loaded set on the client.
- Contracts open grouped by attention rank; payments read as a statement with a running
  balance; units read as an occupancy board; tenants and complexes read as directories with a
  working sort control.
- The shell is the only home of search, result count, empty state, loading and virtualization
  — no presentation carries its own copy.
- Every shape holds from 640×480 upward without a horizontal scrollbar.
- Every touched surface renders correctly in English and Arabic, LTR and RTL.
- The card grid block and its last importer are gone when #254 lands.

## Risks

- **A shape fails by eye, again.** The same failure this spec exists because of. Detected the
  same way: each list ticket ends with the shape on screen against real data before it is
  committed, and #250 carries a declared increment for the part of the queue that cannot be
  judged from a description.
- **The shell grows a prop per shape.** The seam is one snippet; if a shape needs a fifth
  variant of the toolbar, that is the signal it is not the same mechanism, and it goes back to
  design rather than into a flag.
- **Four layouts, one Arabic pass.** Three shapes are new DOM, so RTL is not inherited from
  anything — it is checked per ticket, not once at the end.

## Out of scope

- The write surfaces. Create and edit stay as they are — a side sheet for tenants, dialogs for
  the rest — and move on their own tickets as before.
- The dashboard and the contract form's internal layout, both still on the map's *Not yet
  specified*.
- The `data-table` primitive and `@tanstack/table-core`, left unimported deliberately
  (ADR 0013).
