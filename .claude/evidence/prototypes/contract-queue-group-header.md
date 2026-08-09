---
kind: prototypes
falsifies: []
---

# What should a group header in the contracts triage queue carry besides its name?

Verified against: Svelte 5 / SvelteKit 2, Tauri 2, in the running desktop app, 2026-08-04
Conclusion: Failed

Three variants of the attention-rank group header, switchable via `?variant=`, on the
existing `/contracts` route — the declared increment on
[#250](https://github.com/saud-alnasser/rentable/issues/250).

## Hypothesis

#250 declared the increment with four candidate answers: a count, a total, an urgency read,
or nothing. The expectation was that one of them would win on looking — most likely the
count-and-total, since a triage queue's first question is "how much of this is there and
what is it worth". The header was assumed to be the open question, and the rest of the
queue — rows, grouping, the shared list shell — assumed settled by
[ADR 0013](../../decisions/0013-list-presentation-is-per-concept.md) and
[`list-presentation-spec.md`](../../designs/list-presentation-spec.md).

## Method

Sub-shape A: the variants rendered inside the real `/contracts` route, against the user's
own contracts, with the real sidebar, real search and real density. A floating switcher
gated on `dev` cycled them by click or arrow key. Rank figures were summed over the loaded
result set — a prototype shortcut, noted at the time as something a shipping version would
answer in SQL.

The three disagreed about what a rank header *is*:

- **A — nothing.** The status badge alone, 36px. The header as punctuation: it marks where
  one rank ends and says nothing else.
- **B — a count and a total.** Badge, contract count, and the rank's outstanding money
  trailing, 40px. The header as an account statement's section subtotal. The total was
  suppressed on ranks owing nothing, so `scheduled` and `expired` showed a bare count.
- **C — an urgency read.** Count leading as a large numeral, then the badge, then a thin bar
  showing how much of what the rank expected has been collected, 48px. The header as a
  picture rather than figures.

## Result

**None of the three was chosen, and the header was not what was wrong.** The reviewer's
verdict on all three was that the surface "feels not good" — that the information given "feels
not usable" and that the list shell is wrong for contracts entirely. The rejection landed
below the level the increment was asking about, so no header could have rescued it.

Three concrete faults surfaced, all of which predate the header question:

- **The row does not carry what the work needs.** It shows a fulfilment percentage and an
  end date. Chasing money needs the amount outstanding and the tenant's phone; the row has
  neither, and navigates to a detail page instead of affording the operation.
- **The same contracts were already specified richer elsewhere.**
  [`dashboard-as-the-days-work.md`](../../designs/dashboard-as-the-days-work.md) and
  [#268](https://github.com/saud-alnasser/rentable/issues/268) describe a queue over these
  same contracts carrying "the status, the amount at stake, the end date and the phone",
  grouped overdue / due now / ending soon. #268's own problem statement names the collision:
  two work queues over the same contracts, on different machinery, disagreeing about
  ordering. #250 was built without reconciling against it.
- **Nothing moves.** `tw-animate-css` is imported and the generated primitives animate
  through it, but no file under `src/` imports `svelte/transition` or `svelte/animate` — so
  every surface this repository writes for itself is static. Raised as a general expectation,
  cards included, not a fault of this queue alone.

A fourth question was opened and not settled: whether each concept's surfaces diverge **per
operation** — create, edit, delete, not only the list. ADR 0013 covers presentation of a
concept's *records*; [ADR 0015](../../decisions/0015-the-applications-own-surfaces-converge.md)
states the read/write test for whole surfaces; neither reaches the write surfaces, which
`list-presentation-spec.md` puts out of scope. Nothing in `.claude/decisions/` or
`.claude/designs/` records the per-operation principle, and the reviewer was not certain it
had ever been written down.

## Limitations

- **The three variants were never judged in Arabic.** The rejection came before the locale
  check, so nothing here says whether any of them mirrors correctly.
- **The comparison did not run against an empty or single-rank queue.** How a header reads
  when a rank holds one contract is untested.
- **No variant carried an action.** All three were read-only labels above a row that
  navigates, so the prototype never tested the affordance the rejection points at.
- **Rank figures were summed client-side.** Whether those figures are affordable as a window
  function in the list query was never established, because no variant carrying them
  survived.

## Conclusion

**Failed** rather than Inconclusive: the experiment ran, all three variants were seen against
real data, and every one was rejected. Inconclusive would claim the method failed to produce
an answer, and it produced a clear one.

The answer is not "none of the above" for the header slot — it is that **the header was the
wrong question**. Asking what a group header should carry presumes the rows, the grouping and
the shell beneath it are right, and the reviewer rejected that premise. A prototype scoped to
a declared increment cannot answer a question about the surface the increment sits on; that is
what makes this a design question rather than another round of variants.

The recorded value is the scoping error, not the three headers: **a declared increment is only
answerable while the design it hangs from holds.** #250's increment was declared at design
time against a presentation that had not yet been looked at, and looking at the presentation
is what invalidated it — the same failure mode
[ADR 0013](../../decisions/0013-list-presentation-is-per-concept.md) records for #249's table,
one ticket later and one level down.

Routed to `/design`, with the #268 collision as its first input. #250 is blocked; the code is
deleted.
