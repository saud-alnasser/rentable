---
status: accepted
load-when: the landing screen's content is in question
sources: [src/lib/dashboard/]
supersedes: []
superseded-by: []
---

# The dashboard is the day's work, not a portfolio report

The landing screen showed fifteen portfolio figures above two lists of cards, and the only
actionable thing on it — a tenant's phone number — was below all of them. It becomes a queue of
the contracts needing action today, over a two-figure strip carrying only what the queue cannot
say: this month's collection progress, and occupancy. The thirteen other figures are deleted
rather than relocated.

## Considered Options

- **A briefing** — a few statements, each a number and a route into the list holding the detail,
  with no list on the dashboard at all. The cheapest surface to build and to keep true, and it
  removes any overlap with the contracts queue by construction. Rejected because it takes the
  phone number off the screen: chasing a payment becomes two clicks, and the phone number is the
  evidence that this surface is where work is done rather than where results are read.
- **The same three jobs rebuilt on the shared vocabulary** — statistics, follow-ups and ending
  soon, rendered through the list shell and the shared cells. Loses nothing and is the smallest
  change. Rejected as a re-skin: fifteen figures is still fifteen figures, and it leaves the
  application with two work queues over the same contracts.
- **A separate portfolio page** for the figures being dropped. Rejected as scope nobody asked
  for — a page built to hold statistics that went unread on the screen the user was already on.

## Consequences

**The dashboard and the contracts list are given different jobs, deliberately.** The contracts
list answers *what is the state of every contract* and never empties; the dashboard answers *what
do I do this morning* and empties when there is nothing. Without that split the two are the same
surface twice, which is what this decision exists to prevent — so a change that puts the whole
contract set back on the dashboard, or that strips the triage ordering out of the contracts list,
is undoing this, not extending it.

**A contract appears in the queue exactly once**, filed under its most pressing need, with a
marker where a second need exists. One row means one contract, so a count means contracts and a
click has one destination. The cost is that a renewal is subordinate to money owed on the same
contract until the marker is read.

**The read stops touching payment rows.** Outstanding is expected-as-of-now minus paid, and paid
is the column [ADR 0006](0006-payment-aggregates-are-materialized.md) materialized — so the
screen's cost is a function of how many contracts exist, never of how many payments have been
recorded.
