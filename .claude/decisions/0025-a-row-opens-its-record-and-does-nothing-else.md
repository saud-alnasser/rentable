---
owner: repository
status: accepted
load-when: a list row is given an action, or a row's click target is in question
sources: [src/lib/design/block/list.svelte, src/lib/dashboard/component/queue.svelte]
supersedes: []
superseded-by: []
---

# A row opens its record, and does nothing else

Clicking a record meant three different things depending on the surface: a directory row
opened the record's page, a work-queue row in a money group opened the payment form with the
contract chosen, and a ledger line did nothing at all. **Every row now opens the record's own
page, everywhere, and a row-level action is an explicit control on the row rather than the row
itself.** The rule is uniform because the alternative asks the reader to know which surface
they are on before they know what a click will do — and the surfaces that diverged did so for
reasons that were local and good rather than shared.

This overrides one consequence of
[ADR 0019](0019-the-work-queue-is-the-landing-screen.md) — *"a row in the queue opens the
payment form, not a page"* — and nothing else about it. It also requires a payment to have a
page, which it did not, because a ledger line otherwise has nowhere to open.

## Consequences

**ADR 0014's rejection of the briefing is void, and the landing screen is reopened.**
[ADR 0014](0014-the-dashboard-is-the-days-work.md) rejected a briefing on exactly one ground:
it takes the phone number off the screen, so chasing a payment becomes two clicks. Under this
rule chasing a payment is two clicks from the queue as well, so the queue is paying that cost
without buying anything with it. The landing screen's shape is therefore an open question
again rather than a settled one — recorded in
`.claude/evidence/discussions/the-dashboard-after-the-queues-action.md`, which is where the
grill that reopened it stopped.

**The queue's emptying property survives; the mechanism behind it does not.** A row still
leaves the queue when the debt clears, because membership is computed from what is owed today.
What is lost is that the user could clear it without leaving the screen.

**A payment becomes a record with a page**, which it was not — it was a line in a statement,
reachable only through a row menu. That is a surface this rule creates rather than uncovers,
and it is the price of the rule having no exceptions.
