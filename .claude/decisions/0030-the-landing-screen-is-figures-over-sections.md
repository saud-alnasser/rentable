---
owner: repository
status: accepted
load-when: the landing screen's shape or content is in question
sources: [src/lib/dashboard/]
supersedes: []
superseded-by: []
---

# The landing screen is figures over sections, and a figure routes or a section holds rows

[ADR 0014](0014-the-dashboard-is-the-days-work.md) made the landing screen a queue of the
contracts needing action today, over a strip of two figures. Both figures are proportions —
collected against due, occupied against total — written as sentences, which is the form a ratio
reads worst in; and one long queue answers *who do I chase* while answering *how is the month
going* only through that strip. **The screen becomes a band of routed figures over one section of
records per rank**, and **what may join it is a stated test: a figure routes somewhere, or a
section holds rows.**

Chosen at the running window against four treatments and the shipped screen, recorded in
[the prototype write-up](../evidence/prototypes/the-landing-screen-shape.md). It answers the three
questions [the discussion](../evidence/discussions/the-dashboard-after-the-queues-action.md) left
open when it parked this surface.

## Considered Options

- **A briefing — routed figures and no rows at all.** ADR 0014 rejected this once, on the ground
  that it takes the tenant's phone number off the screen; [ADR 0025](0025-a-row-opens-its-record-and-does-nothing-else.md)
  later made the queue cost that too, so the ground no longer separated them and it was put back on
  the table. Rejected on looking: it leaves nothing to act on.
- **Sections of records and no figures at all**, carrying the strictest admission test put — *only
  sections of records*, under which nothing on the screen can stand alone and re-accumulation is
  impossible by construction. Rejected because it buys that guarantee by deleting the two figures,
  and the figures are the half the sections cannot say.
- **Information beside actions**, on a fixed count budget of three and four — the user's own
  framing when the question was first asked. Rejected as a shape; its budget remains the fallback
  if the test below proves too loose, and is the only one of the four with a mechanical stop.
- **Keeping the queue and adding collapsible groups**, which is the question that opened the
  discussion. Rejected by removal: no section is long enough to want collapsing.

## Consequences

**This overrides ADR 0014's shape and nothing else about it.** 0014's split is what this depends
on and is a constraint on every part of it: the dashboard answers *what do I do this morning* and
empties, the contracts list answers *what is the state of every contract* and never does. Its
consequence that the read never touches payment rows also stands. Recorded in prose rather than
through the supersession fields, following [ADR 0019](0019-the-work-queue-is-the-landing-screen.md),
[ADR 0024](0024-units-read-as-a-directory-and-assigning-them-is-a-form.md) and
[ADR 0029](0029-a-contracts-units-are-transferred-on-the-tab-that-shows-them.md), each of which
overrode part of an earlier decision the same way — a partial override claimed in the field would
read as though the whole decision had been retired.

**The admission test is the load-bearing half, not the layout.** ADR 0014 deleted thirteen
portfolio figures for going unread, and the discipline that kept them out — *only what the queue
cannot say* — was a test that existed only while there was a queue. *A figure routes somewhere, or
a section holds rows* is weaker than the strictest option considered and is chosen knowingly: it
is a rule rather than a judgement, which is what the discussion recorded as missing, and it is
what admits a third figure while excluding a link that carried none.

**A section is bounded, so the screen's read is bounded with it.** The response carries the
per-group summaries and the first few entries of each group rather than the whole queue — the
counts stay whole, so a `see all` figure needs no second read. The database read stays linear in
contracts, as 0014 accepted; what stops growing is what crosses the IPC boundary.

**The screen loses its search, and the contracts list gains a rank filter.** A response capped per
group cannot honestly answer a search over everything, and a `see all` that dropped the reader on
every contract in every state would be the mislabelled door this repository has now removed twice.
Where the ranking rule lives to make that filter possible is [ADR 0031](0031-a-contracts-attention-rank-is-the-contracts-own.md).

**A row still opens its record.** ADR 0025 is untouched: every row in every section navigates to
its contract, and the figures navigate to the page holding their detail.
