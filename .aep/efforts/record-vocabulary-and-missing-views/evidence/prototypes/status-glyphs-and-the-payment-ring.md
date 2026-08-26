---

---


# Can nine statuses be told apart without a word, and does a filled ring read as money?

Verified against: Svelte 5 / SvelteKit 2, Tauri 2, `@tabler/icons-svelte` 3.46, in the running
desktop app against the developer database, 2026-08-11
Conclusion: Successful

Two questions, cut as declared increments on tickets 01 and 03 of
[[efforts/record-vocabulary-and-missing-views/spec]]
and resolved before those tickets were created, so neither carries an increment. Three variants
each, on two independent switchers, on the existing `/contracts` route.

## Hypothesis

**Question one.** [[rules/interface]], under *Status presentation*
decides a status renders as an icon with no visible word. The risk it records is that nine
glyphs must be distinguishable at a row's icon size, and that two pairs — `active`/`fulfilled`
and `defaulted`/`expired` — differ only by whether the contract is paid in full. The expectation
was that **metaphor** would win: nine pictures each chosen to look like its meaning is the
conventional answer and the one a reader arrives with.

**Question two.** The spec replaces the cost figure on a contract row with a ring filled by
payments received against total cost. The recorded risk is that a filled arc on a row is the
shape a loading indicator takes. The expectation was that the bare ring would survive, with the
figures moving to its tooltip as specified.

## Method

Sub-shape A throughout: the treatments rendered inside the real `/contracts` list, the real
dashboard queue and the real complex units tab, against the developer database — 3,257
contracts, 14,985 tenants, 239 units, 2,065 payments — with the real sidebar, real search and
real row density. The harness is the one the contract-form prototype built and kept: `pnpm
prototype <route>` opens the window on one route, and the dev-only switcher stacks, which is
what let two independent questions run in one session.

The database was probed read-only before anything was built, and **no seeding or purging was
done** — it already covered every case. All six contract statuses occur (terminated 2,320,
defaulted 310, expired 295, scheduled 161, active 94, fulfilled 77), both unit statuses occur,
and the fill spread runs from 1,293 contracts with nothing paid through 372 paid in full.

**One addition beyond real rows**: a legend strip above the list rendering all nine glyphs
together at row size. Real rows on that route show only the six contract statuses, and the two
pairs are the whole question, so the nine had to be seen together somewhere.

Three theories per question, disagreeing about *how meaning is carried* rather than about which
icon to use:

| | Question one — the nine glyphs | Question two — the money slot |
| --- | --- | --- |
| A | **metaphor** — nine unrelated pictures, each looking like its meaning. Learn nine things. | **the ring alone**, figures on hover. The spec's own choice. |
| B | **system** — paid-ness carried by one consistent mark: every paid status wears a check, every unpaid one a clock or an alert. Learn one rule, read five. | **the ring around the figure** — the shape and a number arrive together. |
| C | **geometry** — no metaphor at all: circles for a contract's life, triangles for trouble, points for a unit. | **pips** — five segments filling in reading order. Deliberately not an arc, so the spinner risk is answerable rather than assumed. |

## Result

**B and B**, chosen by the user at the running window, on the contracts directory.

**Question one — the system beats metaphor, and the expectation was wrong.** Under B the two
pairs split on one rule rather than on two memorised pictures: `fulfilled` and `expired` both
carry a check, `active`, `defaulted` and `overdue` carry a clock or an alert, `scheduled` is an
hourglass and `terminated` a lock. The glyphs are `hourglass`, `clock-play`, `progress-check`,
`progress-alert`, `circle-check`, `lock`, `point-filled`, `point`, `clock-exclamation`. The
existing tone map carries over unchanged and is doing real work alongside the glyph: within each
pair the two also differ in tone, so the pair is separated twice over.

**Question two — the ring survives, but not bare.** The specified treatment lost to the one
carrying its own number: the percentage sits inside the ring, and the amounts and the
per-interval cost stay in the tooltip. The spinner risk did not have to be resolved by
abandoning the arc — a number in the middle of an arc is not a shape any loading indicator
takes, which is what the pips variant existed to fall back to and did not need to.

**A consequence for the row that the spec did not anticipate.** The spec says the row "states a
shape and the numbers stay one hover away", and accepts as a cost that the row states no number
at all. B contradicts that: the row does state a number, just a different one — a percentage
rather than an amount. The spec's *Considered and rejected* entry for "the ring beside the cost
figure" is unaffected, but its stated consequence is now wrong and the ticket should carry the
corrected one.

## Limitations

- **Judged on the contracts directory only.** The glyphs were mounted on the work queue and the
  units board as well and neither was judged. `occupied` and `vacant` under B are `point-filled`
  and `point` — the least distinctive pair in the set, two small dots — and they were seen only
  in the legend, never at the tile density where they actually appear. This is the most likely
  place the choice fails.
- **Arabic was not exercised.** Neither treatment was seen in RTL. The pips variant was the one
  built to mirror by reading order and it is not the one chosen; the ring is a rotated SVG arc
  and its direction in RTL is untested.
- **640×480 was not exercised**, so the floor criterion is unverified, as it was before this ran.
- **The queue tooltip was reasoned, not observed.** The queue's row lays a click target over
  content carrying `pointer-events-none`, so a status there needs an explicit exemption. The
  prototype gives it one, using the same mechanism the tenant phone number already uses in that
  same row and which works today — so this is a claim about identical shipped code rather than an
  observation of a hover. It should be checked when ticket 01 is built.
- **The percentage inside the ring was not seen at three digits.** Rows showing 0, 13 and 33 were
  observed; a contract paid in full renders 100 at 10px inside a 36px ring and was not looked at.
- **No variant was measured.** Every answer here is a judgement made by looking.
- **The tone map was carried over rather than questioned.** Whether nine glyphs remain
  distinguishable in one tone — which is what a reader with a colour-vision deficiency sees — was
  not tested, and the pairs lean on tone as well as on the mark.

## Conclusion

Successful, and both increments are answered, so tickets 01 and 03 are cut without them.

The status vocabulary is the **system**: one mark carries paid-ness across the whole set, which
is why it beat metaphor — nine unrelated pictures ask the reader to learn nine things and the
system asks them to learn one. That reasoning survives a change of icon library, which is what
makes the answer more than a preference between three pictures.

The money slot is the **ring around its own figure**. The spinner risk turned out not to need the
non-arc fallback: an arc with a number at its centre is not the shape of any loading indicator,
so the arc was never the problem — a *bare* arc was.

Not recorded as a Decision. ADR 0023 already decides that a status is an icon and where its word
lives; which glyphs carry it is the implementation of that decision, and the ring is one row's
treatment rather than an architectural choice. The code is deleted.
