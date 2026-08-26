---
status: implemented
---

# feat: give the contracts one work queue and one directory

Re-plans [#250](https://github.com/saud-alnasser/rentable/issues/250), handed back blocked, and
re-scopes [#268](https://github.com/saud-alnasser/rentable/issues/268), which was accepted but
never built. Both are consumed by ADR 0019;
this document is the reasoning behind the two tickets that replace them.

## Problem

The application specifies two work queues over the same contracts, on different machinery,
grouped by different principles, and it was on course to build both. `list-presentation-spec.md`
gave `/contracts` a queue grouped by contract status in attention order; `dashboard-as-the-days-work.md`
gave the landing screen a queue grouped by what a contract needs today. Both were accepted on
2026-08-04, two and a half hours apart.

The first was built and rejected on looking. The recorded verdict was that the shared list shell
is the wrong shape for contracts, but that cannot be what is true — the dashboard spec puts
contracts on the same shell and stands accepted. What actually differs is the row: the built
queue carries a fulfilment percentage and an end date and navigates to a detail page, where the
specified one carries the status, the money at stake, the end date and the phone. Chasing a
payment needs the second and got the first. Grouping by contract status compounds it: `scheduled`
and `expired` are categories, not work, so a third of the queue is contracts nobody has to do
anything about.

Underneath both sits a defect neither spec noticed. A contract joins the money side of the queue
only when something fell due **in the current calendar month**, while the debt itself is measured
as everything expected by today minus everything ever paid. A quarterly contract two months into
its quarter, behind by two full cycles, has nothing due this month — so it owes real money and
does not appear on any queue at all. The interval that hides the most is the one used by the
contracts worth the most.

## Goal

One surface answers *what do I do today* and one answers *find me that contract*, neither
duplicates the other, and no debt is invisible on either.

## Constraints

- **No schema change.** Every figure needed is already stored: the payment aggregates are
  materialized columns ([[rules/data]], under *Payment aggregates*),
  and the tenant's name and phone already ride the contract list's join.
- **[[rules/data]], under *List reads*, holds.** One bounded query per
  (search, sort) state; nothing re-filtered, re-sorted or re-paginated on the client.
- **The seam of *List presentation* in [[rules/interface]] holds**, and is
  consumed rather than revised: the shell owns query state, search, the result count, the create
  action, the empty and loading states, virtualization and group headers; the concept supplies a
  snippet. A shape needing a new prop on the shell is the signal it is not the same mechanism,
  and goes back to design rather than into a flag.
- **The shell lays rows out at a declared height and clips anything taller.** Neither surface may
  need a row that measures itself; the virtualizer machinery that measures is being deleted, not
  reintroduced.
- **Both surfaces must move.** Nothing this repository writes for itself currently animates —
  verified across the whole of `src/`, where exactly one composed surface carries motion at all.
  ADR 0016 and the frontend
  rule bind every surface touched here: motion responds to an interaction or a trigger, never
  starts by itself, never loops, and is gated for reduced motion.
- **Arabic is first-class and the floor is 640×480.** Both shapes are new layouts, so neither
  inherits a direction that works.
- **The palette has one accent.** Blue marks the active, selected or focused element; no status
  or progress reading introduces a colour.

## Architecture

**Two surfaces, one shell, no shared presentation.** They render different rows for different
reasons and share only the mechanism every list already shares, so there is deliberately no
common record snippet between them — a shared row would be the collision surviving as a
component.

### The landing screen — the work queue

Three groups, in order, each holding a contract exactly once:

| Group | What is in it | Ordered by |
| --- | --- | --- |
| Overdue | past its end date and still owing | largest outstanding, then soonest end, then tenant |
| Owing | inside its period and behind | the same |
| Ending soon | active or fulfilled, inside the notice window, not already above | soonest end, then tenant |

**A terminated contract is in none of them, whatever it owes.** Termination is the one status a
user sets and no derivation overrides, and the contract is locked by it — so a debt on a
terminated contract is a closed matter rather than work, and a queue that listed it would be
asking the user to chase something they had already ended.

**Membership on the money side is "owes anything today", never "fell due this month".** Outstanding
is everything expected by today minus everything ever paid — the figure the domain already
computes — and a contract is in the queue when that is above zero. The group heading is *owing*
rather than *due now* for the reason the change exists: the group holds debts months old, and
*due now* would misdescribe exactly the case this fixes.

A contract that owes money **and** ends inside the notice window appears once, under the money,
carrying a marker for the second need. That is the cost of one row per contract, paid
deliberately so a count means contracts and a click is unambiguous.

**The row leads with the tenant name**, then the status, the amount at stake, the end date and the
phone — each through the shared cell treatment, never a local rendering. The phone is selectable
rather than swallowed by the row's click target.

**The row's primary action is recording a payment**, not navigating: clicking a row in either money
group opens the shared form surface with the contract already chosen, so the distance between
seeing a debt and clearing it is one click and the row leaves the queue as it is worked. A row in
the renewals group has nothing to record and opens the contract instead. A read surface of one
concept reaching a write surface of another is placed by
[[rules/interface]], under *Surface kinds*, and the direction is
already established in this codebase — the contract detail surface imports the payment module's
own components today.

**Above the queue, two figures and no others**: this month's collected against due, and occupied
against total units. The group headings carry their own money totals, so a strip repeating them
would print the same number twice. Thirteen portfolio figures go, along with the page's own card,
well and virtualizer machinery — deleted, not left unimported.

**The read stops touching payment rows.** Outstanding comes from the materialized columns, so the
queue needs contracts and their tenant join and nothing else; the month figure is one scalar sum,
and occupancy one count over unit status. The screen's cost becomes a function of how many
contracts exist rather than how many payments have ever been recorded.

### `/contracts` — the directory

No grouping. A two-line row: the tenant name leading, the contract number and the period beneath
it, the status and the cost trailing. **The cost is per interval and the row shows the interval
with it** — the domain's own guidance is to prefer the fuller reading wherever the bare word could
be taken either way, and a bare figure beside a contract reads as the contract's total.

A sort control offers exactly the keys the query can order by, built from the same list the query
validates against so the control cannot come to offer one the query would reject: tenant name,
contract number, start, end, cost, and status. **Status orders by attention rank, not
alphabetically** — the ranking expression built for the abandoned grouping survives here as the
only ordering of the status enum that carries meaning. Ties fall to a stable order so a page of
equal values is not in insertion order.

Search is unchanged and stays answered in SQL, across every field the row shows and several it
does not.

## Approach

**Two tickets, neither gating the other.** They touch different procedures — the directory changes
the contract list's ordering and adds its sort keys; the queue replaces the dashboard's read
entirely — so they can be built at once and are cut without an edge between them. Each is one
vertical slice through the router, the domain, the presentation, the translations and the tests.

**The queue carries a declared increment and the directory does not.** What a group heading carries
beside its name, and whether the marker for a second need actually reads, cannot be judged from a
description — and the last attempt to answer the first of those failed because the surface beneath
it was in question. It is not any more: the surface, the row, the action and the membership rule
are all settled above, which is what makes the increment answerable this time. The directory needs
no increment; the shape shipped for tenants and the pattern held.

Rejected, so they are not proposed again:

- **Keep the queue at `/contracts` and reduce the landing screen to a strip and a link.** Rejected
  in ADR 0019 — it loses the phone number from the landing screen, which is what makes that screen
  an action surface.
- **One queue component mounted on both routes.** Rejected in ADR 0019 — reduces the duplication to
  a component instead of removing it.
- **Two surfaces sharing only the row treatment.** Rejected in ADR 0019 — leaves the collision
  intact.
- **Put the outstanding money on the directory row.** Rejected here: it returns the queue's own
  figure to the surface just decided is not the queue, and the two start disagreeing again the
  moment one is filtered differently.
- **Put the units held on the directory row.** Rejected here, though it answers how people actually
  search for a contract. It needs an aggregate join, and units are unbounded where a count is not,
  so a contract over nine units truncates. Worth revisiting as its own change if searching by
  contract number proves not to work.
- **Keep the month-scoped membership and accept the gap.** Rejected here: a queue that hides a debt
  falsifies the premise of the surface, which is that it empties when there is nothing to do.

### The tickets

One root and two children, neither child gating the other. Proposed here and not created until
approved — creating an issue publishes.

| Ticket | Title | Edges | Carries |
| --- | --- | --- | --- |
| root, new | feat: give the contracts one work queue and one directory | Related: #211 | the reconciliation; closes when both children do |
| child, **#268 re-scoped** | feat(dashboard): make the landing screen the work queue | Part of the root | the three groups; the owes-today membership; the payment-form action; the two figures; the old machinery deleted; increment: what a heading carries, and whether the also-ending marker reads (`prototype`) |
| child, new | feat: move contracts to the directory list | Part of the root | the two-line row with cost and interval; the sort control including status by attention rank; grouping removed |

Two existing tickets move with it. **#250 is closed as not planned**, with ADR 0019 as the
one-line reason — its outcome was the queue at `/contracts` and that outcome is now wrong.
**#254's edges are corrected** to name the directory ticket in place of #250, so the contract step
still waits for every list to have moved off the card grid rather than waiting on a ticket nobody
will build.

The root is top-level rather than under the interface map, for the reason the dashboard spec
already gave for #268: a later run's root does not hang from an earlier one's.

## Acceptance criteria

- Opening the application shows contracts needing action, grouped overdue, then owing, then ending
  soon, each heading stating how many contracts and how much money it holds, and a contract appears
  in exactly one group.
- A contract behind by cycles that fell due in earlier months appears in the queue, showing what it
  owes today — not only contracts with something due in the current month.
- A contract that owes money and ends inside the notice window is under the money group and says on
  its row that it is also ending.
- Clicking a row in a money group opens the payment form with that contract already chosen; clicking
  a row in the renewals group opens the contract; selecting the phone does neither.
- With nothing outstanding and nothing ending, the landing screen renders an empty state rather than
  empty groups.
- Exactly two portfolio figures are on the landing screen, and no timestamp claiming when it was
  last current.
- `/contracts` renders every contract ungrouped, one row showing the tenant, the contract number,
  the period, the status and the cost with its interval.
- The directory's sort control offers exactly the keys the query orders by, ordering status by
  attention rank; an order the control does not offer is rejected rather than silently ignored.
- No query either surface issues grows in cost with the number of payment rows, and search on both
  is answered in SQL.
- Every treatment of a tenant name, status, money, date and phone comes from the shared cells.
- Both surfaces carry motion that responds to an interaction or a trigger, and both honour reduced
  motion.
- No colour outside the palette appears on either surface.
- Both render correctly in English and Arabic, LTR and RTL, and hold from 640×480 upward — verified
  on screen, in the running application, against the real database.

## Risks

- **A shape fails by eye again.** This has now happened twice, and both times the rejection landed
  below what was being asked about. Detected the same way and one level lower: the increment on the
  queue asks about the heading only after the surface, the row, the action and the membership rule
  have been settled in writing, so a rejection has less room to be about something else. If it is
  rejected below that level again, the answer is not a third round of variants.
- **The payment form opens from a row and the contract is wrong.** The queue's rows are the only
  place the form is opened without the user having chosen a contract first. Detected by opening it
  from a row and reading the contract on the form before saving anything.
- **The directory reads as a downgrade.** Users lose a screen that showed defaulted contracts
  together. Detected by sorting the directory on status and asking whether that lands in the same
  place; reversible by returning grouping to the directory without touching the queue.
- **Two surfaces drift apart in treatment.** They deliberately share no row component, so nothing
  structural keeps a status or a money figure rendering the same on both. The shared cells are what
  hold it, and the criterion above is the check.
- **Deleting thirteen figures removes one somebody used.** Recoverable from history at the cost of a
  ticket, and the alternative was building a page to hold them.

## Out of scope

- **The other list moves.** Redesigning the payment ledger or the property shapes is not done
  here. Their assignments are **not** re-scoped by this session — ADR 0019 supersedes ADR 0013 for
  contracts alone and leaves the other four standing, and the shell-and-snippet seam is confirmed
  rather than reopened. That is the answer the interface map was holding those tickets for.
- **The notice window.** How many days count as ending soon stays a setting.
- **The contract detail page and the payment ledger**, beyond being navigated to.
- **The domain's status model.** Nothing here changes what makes a contract `defaulted` or
  `active`; the queue reads those statuses and adds no rule of its own.
- **Units on the directory row**, rejected above with the condition that would reopen it.
