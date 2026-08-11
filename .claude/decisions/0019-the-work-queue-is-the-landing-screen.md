---
owner: repository
status: accepted
load-when: the landing screen or the contracts list is being changed
sources: [src/lib/dashboard/, src/lib/contract/]
supersedes: []
superseded-by: []
---

# The contract work queue is the landing screen, and the contracts list is a directory

[ADR 0013](0013-list-presentation-is-per-concept.md) assigned contracts a triage queue, and
[the dashboard spec](../designs/dashboard-as-the-days-work.md) independently specified a
queue over the same contracts on the landing screen. Both were accepted on the same day, and
the collision — two work queues over one set of contracts, grouped by two different
principles, disagreeing about ordering — is what
[#250's prototype](../evidence/prototypes/contract-queue-group-header.md) actually failed on,
below the group-header question it was scoped to ask. So the queue belongs to **one** surface:
the landing screen owns it, grouped by what a contract needs of the user today, and
`/contracts` becomes a **directory** — searched rather than browsed, ordered by a sort control,
carrying no grouping at all.

**This supersedes ADR 0013 for contracts only.** The other four assignments — the payment
ledger, the occupancy board, and the two directories — are untouched, as is the shell-and-snippet
seam, which this decision consumes rather than revises. A blanket supersession would kill four
decisions that nothing has argued against.

## Considered Options

**Keep the queue at `/contracts` and reduce the landing screen to a strip and a link** —
rejected. It is close to the *briefing* the dashboard spec already weighed and rejected, and it
loses the same thing: the tenant's phone number leaves the landing screen, and that number is
the evidence the screen is an action surface rather than a report.

**One queue component mounted on both routes, the dashboard filtered and `/contracts` not** —
rejected. It reduces the duplication to a single component rather than removing it, and two
surfaces still render the same rows under the same headings, so a reader still has to be told
which one is authoritative.

**Two surfaces, sharing only the row treatment** — rejected. The smallest change, and it leaves
the defect the dashboard spec's own problem statement named entirely intact.

## Consequences

**The status ranking stops being a grouping and becomes a sort key.** The attention-rank
expression built for the queue survives — the directory offers *status* as an order, and orders
it by that ranking rather than alphabetically, which is the only ordering of the status enum
that means anything. Nothing else in the directory groups.

**A row in the queue opens the payment form, not a page.** The queue exists because money has
not arrived, so its primary action is recording what did; the row leaves the queue as it is
worked, which is what makes "the surface empties when the answer is nothing" observable rather
than aspirational. The renewals group has nothing to record and still opens the contract — one
surface with two primary actions, stated here because a reviewer would otherwise read it as a
defect.

**There is no longer a surface listing every defaulted contract at once.** That is the price of
the split and it is paid knowingly: the directory answers it by sorting on status, one control
away, and the queue answers the question that was actually being asked of it.

**#250 is obsolete rather than amended.** Its outcome was the queue at `/contracts`, and that
outcome is now the wrong one; the ticket is closed as not planned and replaced.
