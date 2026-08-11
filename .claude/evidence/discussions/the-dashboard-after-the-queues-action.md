---
owner: repository
kind: discussions
falsifies: [.claude/decisions/0014-the-dashboard-is-the-days-work.md]
---

# What is the landing screen once a row no longer records a payment?

Discussed 2026-08-11, during the design run that produced
`.claude/designs/record-vocabulary-and-missing-views.md`. Ended without a decision on the
landing screen's shape; the rule that reopened it was decided and is
[ADR 0025](../../decisions/0025-a-row-opens-its-record-and-does-nothing-else.md).

Consumed: `.claude/decisions/0025-a-row-opens-its-record-and-does-nothing-else.md`,
"Consequences" — written by the same design run. What this contradicts in ADR 0014 is its
*rejection of the briefing*, and 0025 records that the rejection is void; ADR 0014's own
decision is untouched and stays live. The questions under **What stayed open** are not part of
that claim and remain open.

## What was asked

Whether the dashboard's grouped work queue should gain collapsible groups, or be replaced by
something else. The user's own framing, verbatim: *"i'm not sure if its the best approch or
dashboard should be redesgined to have ceneter with general information and quick actions and
what payments are required today and/or this month things like this gives usful information
it's where the user will findout what to do next; where other tabs are for actions/views"* —
and, when pressed for the rule that would govern its content, *"maybe cards sections like
information and actions ceneter"*.

## What was assumed

- That the queue's shape was still settled. It was not: the same session had already decided
  every row navigates to its record, which is what ADR 0025 records.
- That collapsing was the question. It was the presented one; the question underneath it was
  whether a single long grouped queue is the right surface at all.

## What was weighed

**The rejection that held the dashboard as a queue is void.** ADR 0014 rejected a briefing —
statements, each a number and a route into the detail, no list on the screen — on one ground:
it takes the tenant's phone number off the screen, making a chase two clicks. ADR 0025 makes a
chase two clicks from the queue as well. The queue now pays the cost of being an action surface
without being one, so the briefing's disadvantage is no longer a difference between the two
options.

**The failure this surface has already had is re-accumulation.** ADR 0014 deleted thirteen
portfolio figures because they went unread, and the discipline that kept them out — *only what
the queue cannot say* — is a test that exists only while there is a queue. "General information"
is the shape those thirteen figures had. A replacement discipline was put and not chosen.

**Collapsing is probably moot either way.** Its benefit is making one long grouped list
scannable. Sections that show a few rows each and route into the full page carry the same
benefit without a new shell capability, a new piece of state, and a question about whether that
state survives a restart.

**Nothing about the data blocks any of it.** `getExpectedAmountInRange` already computes what
falls due in a range per contract and is used today only to sum a portfolio figure; a
due-this-month section needs a read that keeps the rows rather than new arithmetic.

## What stayed open

- **What the landing screen is.** Sections of records, a set of routed figures, cards split
  between information and actions, or something else. The user described a look rather than a
  rule, twice, which is the signal that prose is the wrong instrument and the question wants
  something to react to.
- **What may appear on it.** Four admission tests were put — everything routes somewhere; only
  sections of records; a fixed count budget; no rule at all — and none was chosen. Without one,
  ADR 0014's failure mode has nothing standing against it.
- **Whether collapsible groups survive.** They are unnecessary under a sectioned screen and
  necessary under a single long queue, so this resolves with the shape and not before it.
- **Whether the two standing figures survive** — this month's collection against due, and
  occupancy. Both would fail the strictest test put and pass the others.
