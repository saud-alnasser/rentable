---
owner: repository
status: superseded by contract-work-queue-and-directory.md
sources:
  - src/lib/dashboard/
  - src/routes/+page.svelte
  - src/lib/design/block/
  - src/lib/design/cell/
  - src/lib/contract/
---

# feat(dashboard): make the landing screen the day's work

## Problem

The landing screen is three surfaces at once and serves none of them well. Fifteen portfolio
figures sit above two lists of tall cards. Nothing among the figures is actionable, and the one
thing on the page that is — a tenant's phone number, so the user can call about money — sits
below a full screen of statistics and inside a card estimated at 320px, taller than the
supported window's 480px floor.

It is the one surface the interface overhaul never reached, so it still speaks the vocabulary
the rest of the application has dropped: wells nested inside wells at the same value, physical
direction utilities on rows the writing direction already mirrors, an accent colour on the
progress bar that the palette does not contain, hand-rolled status, money, date and phone
treatments where shared cells now own all four, and its own copy of a measuring virtualizer in
two near-identical halves.

It is also about to be duplicated. Once contracts open as a triage queue grouped by attention
rank, the application holds two work queues over the same contracts, on different machinery,
disagreeing about ordering. That is not a styling problem and restyling will not fix it.

## Goal

Opening the application answers one question — what needs doing today — and the surface empties
when the answer is nothing.

## Constraints

- **[ADR 0013](../decisions/0013-list-presentation-is-per-concept.md) governs the seam.** The
  mechanism is the shared shell; the presentation belongs to the concept. The dashboard is a
  fifth consumer of that shell, not a fifth list idiom.
- **[ADR 0010](../decisions/0010-lists-load-whole-result-sets.md) holds.** One bounded query per
  search state; nothing re-filtered, re-sorted or re-paginated on the client.
- **[ADR 0012](../decisions/0012-the-query-cache-is-trusted-until-told-otherwise.md) holds**, and
  it has a consequence here: workspace data is trusted until a writer says otherwise, so a
  timestamp telling the user how old the screen is contradicts the policy that keeps it current.
- **Decision 03's system rules hold** — the human handle leads, and a concept carries the same
  treatment on every surface that shows it.
- **The palette has one accent.** Blue marks the active, selected or focused element and nothing
  else; a status or a progress reading may not introduce a colour of its own.
- **Arabic is first-class and the window floor is 640×480.** The queue is a new layout, so
  neither is inherited.
- **No schema change.** Every figure this surface needs is derivable from the materialized
  aggregates ([ADR 0006](../decisions/0006-payment-aggregates-are-materialized.md)), the
  contract's own fields, and unit status.

## Architecture

**The page is a two-figure strip over one queue.** The queue is the shared list shell with a
record snippet and a group header snippet supplied by the dashboard module — the same seam every
other list crosses, so the dashboard owns a presentation and owns no mechanism.

**One row is one contract, filed under its most pressing need**, so a count means contracts and a
click is unambiguous. Three groups, in this order:

| Group | What is in it |
| --- | --- |
| Overdue | a defaulted contract with an outstanding balance — past its end date, not paid in full |
| Due now | any other non-terminated contract with an amount due by today this month, still outstanding |
| Ending soon | an active or fulfilled contract inside the notice window, not already above |

Within overdue and due now, largest outstanding first, then soonest end date, then tenant name —
today's follow-up order, unchanged because nothing here argues against it. Within ending soon,
soonest end date first, then tenant name.

**A contract that owes money *and* ends inside the notice window appears once, under the money,
carrying a marker for the second need.** That is the cost of one row per contract and it is paid
deliberately; whether the marker actually reads is the declared increment below.

**The row leads with the tenant name**, then the status badge, the amount at stake, the end date
and the phone. Every one of those five is a shared cell treatment, not a local rendering. The
phone is the action, so it is selectable rather than swallowed by the row's click target.

**A row navigates to where the work happens**, which is not the same destination for every group:
the payment ledger for the two money groups, the contract for the renewal group. Both are detail
pages of the same concept, so decision 03's rule is satisfied either way — this picks the one
that saves the second click, and it is called out here because a reviewer would otherwise read
it as an inconsistency.

**The strip carries only what the queue structurally cannot say**: this month's collection
progress, collected against due, and occupancy, occupied against total. Every other portfolio
figure goes. Group headers carry their own totals, so a strip repeating them would print the same
number twice.

**The dashboard read stops touching payment rows.** Outstanding is expected-as-of-now minus paid,
and paid is the materialized column — so the queue needs contracts and their tenant join and
nothing else. The month figure is one scalar sum over payments in the month; occupancy is a count
over unit status. The cost of the screen becomes a function of how many contracts exist, never of
how many payments have been recorded against them.

**The search box arrives with the shell rather than being added.** The shell always renders search
and a result count; the dashboard takes both as they are, which means the read accepts a search
term and answers it in SQL. Suppressing the toolbar would mean a prop per shape, which the list
presentation spec named as the signal that a surface is not the same mechanism.

## Approach

**One ticket.** The read's shape and the page consume each other — the page derives its type from
the procedure — so splitting them lands a broken tree either way round. It is one vertical slice
through the router, the domain, the presentation, the translations and the tests.

**It should be built after contracts move to the triage queue**, though it is not gated on it.
Both surfaces answer the same open question — what a group header carries — and whichever is
built first answers it for the other. Contracts is the larger consumer and is already ahead on
the frontier, so letting it go first spends the answer once.

Rejected, with reasons, so they are not proposed again:

- **A briefing — statements and links, no list.** Cheapest to build and cheapest to keep true,
  and it removes the duplication with the contracts queue by construction. Rejected because it
  takes the phone number off the surface and makes chasing a payment two clicks instead of zero;
  the phone number is the evidence that this screen is an action surface rather than a report.
- **Rebuilding the same three jobs on the shared vocabulary.** Loses nothing and is the smallest
  change. Rejected because it is a re-skin: fifteen figures is still fifteen figures, and the
  duplication with the contracts queue survives it intact.
- **Task rows — a contract appearing once per thing it needs.** Hides nothing and makes each
  group a complete worklist. Rejected because the same tenant name twice on one screen reads as
  a defect, and the header count stops meaning contracts.
- **A flat urgency-ordered list with no groups.** Simplest, and a true next-thing-to-do order.
  Rejected because there is then no way to see at a glance that four renewals are waiting.
- **A separate portfolio page for the figures being dropped.** Loses nothing at all. Rejected as
  scope that was not asked for: a surface built to hold statistics nobody opened on the screen
  they were already on.

### The ticket

One ticket, which is therefore this run's root. Cut as **#268**, top-level rather than under the
interface map — that map exited before this surface was specified, and a later run's root does
not hang from an earlier one's.

> **feat(dashboard): make the landing screen the day's work** — #268
>
> Related: #211 (the interface map, which left this surface unspecified), #250 (the contracts
> triage queue, which answers the same open question)
>
> **Problem.** The landing screen shows fifteen portfolio figures above two lists of tall cards.
> None of the figures is actionable; the one thing that is — a tenant's phone number — is below
> all of them, in a card taller than the smallest supported window. It is the last surface still
> carrying the idioms the interface overhaul replaced, and once contracts open as a triage queue
> it is a second work queue over the same contracts.
>
> **Outcome.** Opening the application shows the contracts needing action today, grouped overdue,
> then due now, then ending soon, each group stating its own contract count and money total. A
> contract needing both money and renewal appears once, under the money, marked as also ending.
> Above the queue, two figures: this month's collected against due, and occupied against total
> units. With nothing to act on, the surface says so. The queue is the shared list shell with a
> dashboard-supplied record and group header; the page's own card, well and virtualizer machinery
> is deleted.
>
> **Acceptance.**
>
> - The three groups appear in that order, each with its contract count and money total, and a
>   contract appears in exactly one of them.
> - A contract that owes money and ends inside the notice window is under the money group and
>   says on its row that it is also ending.
> - With nothing outstanding and nothing ending, the surface renders an empty state, not empty
>   groups.
> - Exactly two portfolio figures are on the screen, and no timestamp claiming when it was last
>   current.
> - No query the screen issues grows in cost with the number of payment rows; search is answered
>   in SQL.
> - Tenant name, status, money, date and phone each render through the shared cell treatment.
> - No colour outside the palette appears anywhere on the surface.
> - It holds at 640×480 and mirrors in Arabic, both verified on screen.
>
> **Declared increments.**
>
> - after the queue renders against real contracts: does the marker for a second need actually
>   read, or does a contract that owes money quietly expire — and what does a group header carry
>   beside its name? — type: `prototype`

## Acceptance criteria

- Opening the application shows contracts needing action, grouped overdue, then due now, then
  ending soon, each group stating how many contracts and how much money it holds.
- A contract needing both money and renewal appears exactly once, under the money, and says on
  the row that it is also ending.
- With nothing to act on, the surface says so rather than rendering empty groups.
- Above the queue, exactly two figures: this month's collected against due, and occupied against
  total units. No other portfolio figure is on the screen.
- The read issues no query whose cost grows with the number of payment rows, and answers search
  in SQL.
- The surface renders no colour outside the palette, and no timestamp claiming when it was last
  current.
- Every part of it holds at 640×480 and mirrors in Arabic.
- The card, well and virtualizer machinery this page carried is gone rather than unimported.

## Risks

- **The shape fails by eye, as the table did.** The same risk the list presentation spec exists
  because of. Detected the same way: the surface goes on screen against real contracts before it
  is committed, and the part that cannot be judged from a description is declared as an increment
  rather than guessed.
- **The marker for a second need goes unread**, and a contract that owes money quietly expires.
  Detected by looking at a contract that owes and ends in the same week — which is the increment.
- **The two queues drift apart.** The dashboard's row and the contracts queue's row are siblings
  showing one concept; if they diverge in treatment, decision 03's rule has been broken on the
  surface it matters most. Detected by putting them side by side once both exist.
- **Dropping thirteen figures removes one somebody used.** Reversible from history at the cost of
  the ticket that put it back, and the alternative was building a page to hold them.

## Out of scope

- The contracts triage queue and the other list moves. This changes no list but the dashboard's.
- The contract form's internal layout, still unspecified.
- The notice window itself — how many days count as ending soon stays a setting, unchanged.
- The window controls block's home, which has its own ticket.
