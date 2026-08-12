---
owner: repository
kind: prototypes
falsifies: [.claude/decisions/0014-the-dashboard-is-the-days-work.md]
---

# What is the landing screen, what may appear on it, and do the two standing figures survive?

Verified against: Svelte 5 / SvelteKit 2, Tauri 2, `@tabler/icons-svelte` 3.46, in the running
desktop app against the developer database, 2026-08-12
Conclusion: Successful

Consumed: `.claude/decisions/0030-the-landing-screen-is-figures-over-sections.md` — which overrides
ADR 0014's shape in prose and records the admission test. The rank ownership this forced is
`.claude/decisions/0031-a-contracts-attention-rank-is-the-contracts-own.md`.

The three questions left open by
[`the-dashboard-after-the-queues-action.md`](../discussions/the-dashboard-after-the-queues-action.md),
which recorded them as gated on a prototype because the user had described the screen as a look
twice and prose was the wrong instrument. Four treatments plus the shipped screen as the control,
on one switcher, on the existing `/` route.

## Hypothesis

The discussion put four admission tests and chose none, and named that absence as the thing
leaving [ADR 0014](../../decisions/0014-the-dashboard-is-the-days-work.md)'s failure mode —
thirteen unread portfolio figures — with nothing standing against it. The expectation was that
the **shape** would be chosen first and the admission test would follow from it, and that the
strictest test would win: *only sections of records*, which is the one that cannot re-accumulate
because nothing on the screen stands alone.

A second expectation, carried in from the user's feedback that opened this run — *"utlize more
icons and progress ciricle and grouped in dashboard"* — was that the request was for decoration,
and that it would turn out to be about structure once there was something to look at.

## Method

Sub-shape A throughout: every treatment rendered on the real `/` route, inside the real frame,
against the developer database, through the shared cells and the existing
`api.contract.dashboard` read. No procedure was written and no data was seeded — the four
treatments differ only in what they render from one query.

The switcher is the one kept from the contract-form prototype, gated on `dev`, remembering its
selection across the Rust watcher's reloads. The shipped queue was left in the rotation as the
control, so every judgement was made against what exists rather than in a vacuum.

Four theories, disagreeing about **what kind of thing a landing screen is** rather than about
how to decorate one — each carrying one of the discussion's four admission tests, so that
choosing a shape chose a test with it:

| | The screen is | Admission test it enforces | The two figures |
| --- | --- | --- | --- |
| Q | one long grouped queue over a two-figure strip — **the shipped screen** | only what the queue cannot say | survive, as text |
| A | routed figures, no rows at all — the briefing ADR 0014 rejected | everything routes somewhere | survive, as hero rings |
| B | three short sections of records, no figures at all | only sections of records | deleted |
| C | information beside actions — the user's own *"cards sections like information and actions center"* | a fixed count budget: 3 + 4 | survive, as the information half |

A fifth was built during the run rather than planned, which is what the branch's *prototypes
evolve until the question is settled* is for:

| | | |
| --- | --- | --- |
| D | A's figure band over B's record sections | a figure routes, or a section holds rows | survive, and gain a third |

## Result

**D, built on request after A and B were seen, and chosen.**

**The shape was answered by mixing two theories, not by picking one.** The first verdict was not
a choice between the four but an instruction: *"dashboard should be mixed between prototype 2 and
3 without the units management in prototype 2"* — A's figures over B's sections. Neither pure
theory won: A alone gives nothing to act on, B alone throws away the month's progress, and the
screen wants both questions answered at once — *how is the month going* and *who do I chase*.

**The hypothesis about the admission test was wrong.** The strictest test lost precisely because
it was strict: B deletes the two standing figures, and the figures are what the sections cannot
say. The test that survives is the looser *a figure routes, or a section holds rows* — weaker
than B's, but not a judgement call, and it is what admitted a third figure while excluding the
units-management link.

**Two things were dropped from the mix rather than carried across, and both were right.** The
units-management link was named by the user; it was the one item in A carrying no figure, so it
failed A's own test as well. A's three group-count cards were dropped in building D, because the
section headers below already state each group's count and total — a screen saying the same
number twice is the shape re-accumulation takes. Only the outstanding total survived, because no
section states it.

**The icons-and-rings request was about structure, as expected.** The ring already existed and
already carried its own percentage, decided by
[`status-glyphs-and-the-payment-ring`](status-glyphs-and-the-payment-ring.md), and it appeared on
exactly one surface. What the request wanted was for that vocabulary to reach the landing screen
at a size that leads, not for more ornament.

**Three defects surfaced by looking, none of which prose would have found:**

- **Two nested scrollbars.** Every variant opened an `overflow-y-auto` inside the frame's own
  scroller, so the wheel was split between two regions that each looked like the page. The
  shipped queue never had this — its virtualized list owns one scroll region. Fixed by removing
  the inner scroller and pinning the figure band to the scrollport with `sticky`, so the month
  stays readable while the sections are worked.
- **The last card had no room beneath it.** The route container's bottom padding and the sticky
  band's negative top margin were cancelling inside the same column.
- **The `see all` footer's hover highlight was square** against a `rounded-2xl` card, because the
  footer carried no bottom rounding of its own.

## Limitations

- **Arabic was not exercised.** It was asked for explicitly, for the third prototype running, and
  no verdict came back. Every layout uses logical properties and the rings rotate rather than
  mirror, so the construction is right in principle — but D's sticky band, its bleed margins and
  the three-across grid have not been seen in RTL, and this remains the most likely place the
  choice fails.
- **Narrow widths were not confirmed.** D's band collapses from three across to two to one and
  its sections are full width, but the window was not reported as having been dragged narrow.
  640×480 remains unverified, as it has been through every prototype in this directory.
- **The section cap was never stressed.** D shows four rows per section over a developer database;
  how it reads when a rank holds one contract, or when all three ranks are empty, was not looked
  at. The empty state exists in the code and was not seen.
- **The sticky band was not seen against a long scroll.** It pins correctly in principle; whether
  it eats too much of a short window when all three sections are populated is unobserved.
- **No variant was measured.** Every answer here is a judgement made by looking. D issues the same
  single query the shipped screen does, so nothing new was introduced to measure, but the
  non-virtualized sections are unbounded in a way the shipped list is not.
- **C's fixed count budget was never tested.** It is the only admission test with a mechanical
  stop, and it went unjudged because the shape it came attached to was not chosen. If D's looser
  test proves too loose, that budget is the fallback and this prototype says nothing about it.

## Conclusion

Successful. All three questions are answered.

**What the landing screen is:** a band of routed figures over sections of records. Not the
briefing, not the sectioned list, and not the queue — the two questions a landing screen is asked
are different questions, and one surface answering both is what neither pure theory could be.

**What may appear on it:** *a figure routes somewhere, or a section holds rows.* Weaker than the
strictest test put in the discussion, and chosen knowingly — the strict one buys its guarantee by
deleting the figures, which is the wrong trade on a screen whose first job is *how is the month
going*. It is still a rule rather than a judgement, which is what the discussion said was missing.

**Whether the two standing figures survive:** they do, and they stop being text. Both are
proportions, and a proportion is what a number states worst — the ring was already the
repository's answer to that and was reaching one row on one surface.

**This contradicts ADR 0014's decision, not merely its rejected options.** 0014 decided the screen
*"becomes a queue of the contracts needing action today, over a two-figure strip"*; D is neither a
queue nor a two-figure strip. The discussion had already voided 0014's *rejection of the
briefing*; this voids the positive decision as well. Healing that is `/design`'s — a Decision
recording the shape, and the admission test with it, since the test is the part that will be
argued with later and the part 0014's failure mode turns on.

The collapsible-groups question the discussion left open resolves by removal: nothing on D is long
enough to want collapsing.

D is being folded into the real screen as a fresh implementation effort, and the variants go with
it: they carry no tests, hold their labels in a throwaway module rather than the locale files, and
were written against a query whose section counts are unbounded. What survives this write-up is
the shape and the admission test, not the files that demonstrated them.
