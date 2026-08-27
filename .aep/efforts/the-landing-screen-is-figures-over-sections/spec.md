---
status: implemented
---

# feat(dashboard): the landing screen is figures over sections

## Problem

The landing screen is one long grouped queue over a strip of two figures written as text. Its
shape was never decided — the discussion that parked it
left three questions open, and recorded that the user had described the screen as a look twice,
which is the signal that prose was the wrong instrument. Those questions are now answered by
[[efforts/the-landing-screen-is-figures-over-sections/evidence/prototypes/the-landing-screen-shape]], at the running window,
against the developer database.

Three things are wrong with what ships today, and the prototype found all three by being looked
at rather than by being reasoned about.

**The two figures are proportions written as sentences.** *Collected this month against due* and
*occupied against total* are both ratios, and a ratio is what a number states worst. The
repository already decided the answer to that — a ring carrying its own percentage,
[[efforts/record-vocabulary-and-missing-views/evidence/prototypes/status-glyphs-and-the-payment-ring]] — and that ring
reaches exactly one surface, a contract row.

**One long queue answers one question when the screen is asked two.** *How is the month going*
and *who do I chase* are different questions, and a single scrolling list answers only the
second while the strip above it answers the first in the weakest available form.

**Nothing bounds what may appear.** ADR 0014 deleted thirteen portfolio figures because they went
unread, and the discipline that kept them out — *only what the queue cannot say* — is a test that
exists only while there is a queue. No replacement test was ever chosen, so the failure mode has
nothing standing against it.

## Goal

The landing screen is a band of routed figures over sections of records, and a stated admission
test governs what may join it. A contract's attention rank becomes a fact about the contract
rather than a fact about the dashboard, so the contracts list can be filtered by it and the
dashboard becomes a view.

## Constraints

- **The shape is decided and is not re-opened.** It was chosen at the running window. What this
  spec plans is how to build it properly, not whether to.
- **Both locales.** The prototype's Arabic was never exercised — through three prototypes running,
  which is now the longest-standing gap in this directory's record. The sticky band, its bleed
  margins and the three-across grid are unseen in RTL.
- **IPC payload is the durable cost.** [[efforts/ui-overhaul/evidence/research/interface-performance-baseline]]
  measured payload as the hardware-independent figure and named per-keystroke megabytes as the
  fault it found. A screen showing twelve rows must not ship the whole queue to paint them.
- **ADR 0014's split survives and is load-bearing.** The dashboard answers *what do I do this
  morning* and empties; the contracts list answers *what is the state of every contract* and never
  does. Nothing here may collapse the two into one surface twice.
- **A row opens its record and does nothing else** ([[rules/interface]], under *Row activation*).

## Architecture

**The rank moves into the contract domain.** `getDashboardQueueGroup`, `compareDashboardQueueEntries`,
`summarizeDashboardQueueGroups`, `isContractEndingSoon`, `isDashboardMoneyGroup` and the group
constants are rules about a contract — its status, its end date, and what it owes today — living
in a module named for the surface that happened to read them first. They move to the contract
module and keep their tests. The dashboard router then reads the rank rather than deriving it,
and `src/lib/dashboard/` becomes a view over the contract domain instead of a peer holding a
domain rule. This is the dependency direction the current layout inverts: a view depending on a
domain is ordinary, a domain depending on a view is not, and the contracts list is about to need
the rank.

**The dashboard read narrows to what the screen shows.** `api.contract.dashboard` returns the
per-group summaries it already computes, plus **the top N of each group** rather than the whole
queue. The summaries carry the counts, so the `see all (N)` figure needs no extra read. The
router's own database read is unchanged and stays linear in contracts — ADR 0014 accepted that
and nothing here disturbs it; what changes is what crosses the IPC boundary. The screen's search
input is dropped, which is what makes a bounded response coherent: a response capped per group
cannot honestly answer a search over everything.

**The contracts list gains the rank as a filter.** With the rank in the contract domain, the
contract list read accepts one and filters by it, and the directory offers it beside its search.
This is what makes `see all` an honest door: overflow from *overdue* lands on every overdue
contract rather than on every contract in every state.

**The landing screen becomes two regions.** A band of three routed figures — collection this
month, occupancy, outstanding — pinned to the top of the scrollport, over one section per rank.
Each section is a card carrying an icon, its count, its total where the rank owes money, at most
four rows, and a `see all (N)` footer. The band's figures are rings where the figure is a
proportion; the ring is the shipped cell, which gains a size it does not currently take rather
than being reimplemented. The screen opens no scroller of its own — the frame already owns one,
and the prototype's nested pair is what made its scrolling wrong.

**The admission test is stated, not implied:** *a figure routes somewhere, or a section holds
rows.* It is recorded as a Decision because it is the part that will be argued with, and because
the thing it exists to prevent — ADR 0014's thirteen unread figures — has already happened once.

## Approach

The rank move goes first and alone. It is a pure refactor with no behaviour change, it gates
everything else, and landing it by itself means the risky part — a domain module changing hands,
with the dashboard's tests moving with it — is reviewable without a new screen on top of it.

The contracts filter and the narrowed read then proceed independently of each other, both on the
moved rank. The screen lands last, because it is the only ticket that cannot be honest before the
other two exist: its `see all` needs a destination that can filter, and its sections need a
response shaped to them.

**Considered and rejected — the contracts list calls the dashboard's rule where it stands.** The
smallest possible diff: one import, nothing moves, one rule still. Rejected because it makes the
contract domain depend on the dashboard, which is backwards, and because the next person to need
a rank outside the dashboard faces the same question with one more caller in the way.

**Considered and rejected — a dashboard-owned page showing one rank at full length.** It avoids
the ownership question entirely, and it partly rebuilds the long queue the new shape was chosen
over. Rejected by the user in favour of the filter.

**Considered and rejected — keeping the landing screen's search.** No capability would be lost,
but a search over sections capped at four rows has to either search the whole queue and re-cap or
search only what is shown, and neither reads obviously. Finding a contract is the contracts
list's job and it has search; ADR 0014's split says so.

**Considered and rejected — expanding a section in place instead of routing.** No navigation, no
new filter capability. Rejected because the screen grows back into the long scrolling list the
new shape replaced, and the collapsible-groups question the prototype closed by removal reopens
with it.

## Acceptance criteria

- The landing screen shows three routed figures over one section per rank, and no long queue.
- Every figure in the band opens the page holding its detail; collection and occupancy are rings
  carrying their own percentage.
- A section states its rank, its count, and its total where the rank owes money, and shows at
  most four rows.
- `see all` on a rank opens the contracts list filtered to that rank, and the count it states
  matches what lands there.
- The landing screen has no search input, and the contracts list can be filtered by rank.
- `api.contract.dashboard` returns at most four entries per rank; the response size does not grow
  with the number of contracts needing action.
- The whole screen scrolls as one region, the figure band stays visible while the sections are
  worked, and the last card has room beneath it.
- A rank holding nothing shows no section; a screen with no work shows the empty state.
- Every string on the screen comes from the locale files, and the screen reads correctly in
  Arabic, right to left.
- The rank rules keep their existing tests, passing unchanged, from their new home.
- No file under `src/lib/dashboard/component/prototype/` remains, and `src/routes/+page.svelte`
  carries no switcher.

## Risks

- **Arabic.** The band's sticky bleed margins and the three-across grid are unseen in RTL, and
  this gap has survived three prototypes. Detected by switching the locale on the finished screen
  before the ticket is called done — named in the ticket's criteria so it cannot be skipped again.
- **The moved rank is a wider blast radius than it looks.** `dashboard.ts` is imported by the
  dashboard router and by `queue.svelte`, and its tests are `dashboard.test.mjs`. Detected by the
  suite, which covers the rules directly; the refactor lands alone so a failure names itself.
- **The rank filter needs the outstanding amount, which the contracts list does not compute
  today.** If it turns out the contract list read cannot produce it without the dashboard
  router's whole portfolio pass, the filter costs more than a predicate. Detected while building
  the filter ticket, before the screen depends on it — which is why it is not the last ticket.
- **Four rows per section may be the wrong number.** It was never stressed: the prototype ran
  against a database where every rank was full, and a rank holding one contract was never seen.
  Cheap to change, and stated in one place.
- **The sticky band on a short window.** It pins correctly; whether it eats too much of a 640×480
  window is unobserved, as that size has been through every prototype in this repository.

## Out of scope

- **The three ranks, their rules, and their ordering.** They move; they do not change.
- **Narrowing the dashboard router's database read.** It stays linear in contracts, as ADR 0014
  accepted. Only the response narrows.
- **The contracts list's own presentation.** It gains a filter and nothing else.
- **`interface-performance-baseline`'s waiting state.** It declares it falsifies ADR 0008, which
  is itself already superseded by 0009, so it is waiting against retired knowledge. Raised, not
  resolved — settling it is its own decision and guessing would retire a finding nobody acted on.

## Decisions this run records

Both land with this document, in the `docs:` change, not inside a ticket's commit.

- **The landing screen is figures over sections, and a figure routes or a section holds rows.**
  This contradicts ADR 0014's positive
  decision — the screen is neither a queue nor a two-figure strip. It is recorded as a **prose
  override of 0014's shape**, not through the supersession fields, following the precedent 0019,
  0024 and 0029 each set: 0014's split between the dashboard and the contracts list survives
  intact and is a constraint on this work, as does its consequence that the read never touches
  payment rows. Claiming supersession in the field would retire those too.
- **A contract's attention rank is a contract-domain concept.** The rule moves; the dashboard
  reads it.

Both evidence files gain their `Consumed:` line in the same change as the healing:
`the-dashboard-after-the-queues-action.md`, whose three open questions are now all answered, and
`the-landing-screen-shape.md`.

## Ticket set

**Root** — #211, the overhaul's map issue, as the previous feedback run also used. The landing
screen is the overhaul's last unanswered surface, so it hangs where the overhaul does. This run
creates no root of its own.

| # | Title | Tier | Blocked by |
| --- | --- | --- | --- |
| [#374](https://github.com/saud-alnasser/rentable/issues/374) | `refactor(contract): a contract's attention rank is the contract's own` | Standard | — |
| [#375](https://github.com/saud-alnasser/rentable/issues/375) | `feat(contract): the contracts list filters by attention rank` | Standard | #374 |
| [#376](https://github.com/saud-alnasser/rentable/issues/376) | `refactor(dashboard): the landing screen's read is bounded by what it shows` | Standard | #374 |
| [#377](https://github.com/saud-alnasser/rentable/issues/377) | `feat(dashboard): the landing screen is figures over sections` | Standard | #375, #376 |

#374 gates #375 and #376, which gate #377. #375 and #376 order against nothing between them.
