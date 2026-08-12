---
owner: repository
kind: prototypes
falsifies: []
---

# How much colour should a directory row's count glyphs carry, and keyed on what?

Verified against: Svelte 5.56 / SvelteKit 2.70, Tauri 2, `@tabler/icons-svelte` 3.46, in the
running desktop app against the developer database, 2026-08-12
Conclusion: Successful

The complaint was that the tenants and complexes rows read flat beside the contracts row. The
contracts row takes its chroma from a status glyph and a payment ring, and neither of the other
two has an equivalent — so the question is not which shade to use but whether a *count* may
carry colour at all, and what the colour is keyed on. Gated the design of the record and
directory refinements raised on 2026-08-12; the user held the gate rather than overriding it.

## Hypothesis

The candidate carried into the session was **tint the live state**: a count takes the primary
tone above zero, reusing the vocabulary the status cell already declares, where primary means
running and muted means settled or not started.

The expectation was that this would fail on the complexes list. A read-only probe of the
developer database, taken before anything was built, said the rule would light the occupied
glyph on **29 of 29** complex rows and roughly **3 of every 100** tenant rows — and a colour
present on every row distinguishes nothing, which is *Emphasize by de-emphasizing* read
backwards. So the expectation was that the exception-keyed variant would win on the complexes
list, and that the two lists might need different rules.

## Method

Sub-shape A: the treatments rendered inside the real `/complexes` and `/tenants` lists, against
the developer database, with the real sidebar, real search, real virtualized row density and no
seeding or purging. The database already covered the cases:

| | |
| --- | --- |
| complexes | 29 holding units, 24 of them fully let, none fully vacant, the biggest holding 18; 1 holding no units |
| units | 235 occupied, 7 vacant |
| tenants | 14,985 — 14,536 holding no active contract, 417 holding one, 32 holding two |
| contracts | 2,320 terminated, 310 defaulted, 295 expired, 160 scheduled, 94 active, 77 fulfilled |

Three theories, disagreeing about what earns colour rather than about which shade:

| | The rule |
| --- | --- |
| A | **control** — no colour. Every glyph and figure muted, as shipped. |
| B | **live state tinted** — the count standing for something running takes the primary tone above zero: occupied units, active contracts. |
| C | **exception lifted** — the count worth acting on takes *contrast* rather than a hue: vacancy rises to the foreground tone, occupied and total stay muted. Built as the answer to the density problem, and deliberately hue-free, since *Don't rely on color alone* prefers light-dark separation to a second colour. |

Both B and C add the occupied count the complexes row lacks, so all three figures — total,
occupied, vacant — are present in each.

A second switcher, stacked above the first, cycled the glyph standing for the unit total
independently of the colour question: `door` as shipped, then layout-grid, circles, home and
key. Cycling it without disturbing the variant is what let the picture for the total be judged
against the two state marks beside it.

The code lived in `src/lib/prototype/` beside the switcher rather than under
`.claude/position/prototypes/`, per the drift finding
[prototype-code-cannot-live-where-the-policy-puts-it](../drift/prototype-code-cannot-live-where-the-policy-puts-it.md).

## Result

**B on both lists, with the unit total on the layout-grid glyph.** Chosen by the user at the
running window.

**The density objection did not survive contact with the screen, and the hypothesis was
wrong.** B tints 29 of 29 complex rows on this data and was preferred anyway. Two things
appear to be why, and both are visible only at row scale: the tint lands on *one* of three
counts rather than on the row, so the row still has a quiet majority to read the colour
against; and the figure beside the glyph varies even where the tint does not, so the coloured
mark is labelling a quantity rather than asserting a state. The reasoning that "a colour on
every row carries no information" treats the tint as a per-row flag, and it is not one.

**C lost despite being built to answer the objection.** Lifting vacancy by contrast alone put
the emphasis on the five complexes with a vacancy — informative, but it made the common case
read as the absence of something rather than as a healthy portfolio, and the foreground tone
was not separable enough from muted at row size to carry the distinction on its own.

**The door was the wrong picture for the total, and that is a set problem rather than a taste
one.** Beside a solid disc and a dashed ring, a door is a different category of drawing — a
thing, next to two states. The layout grid reads as *the spaces themselves*, which is what the
total counts, and it shares the geometric register the other two are already in.

**One rule covers both lists.** The tenant row's active-contract count takes the same treatment
even though the density inverts — 3 rows in 100 rather than 29 in 29. A tenant holding a
running contract is the exception worth spotting, so the rarity of the tint is the right
behaviour there, from the same rule rather than from a second one.

## Limitations

- **Arabic was not exercised.** Neither variant was seen in RTL. Nothing here is
  direction-sensitive in principle — a tone is not a transform — but the three-count cluster is
  wider than the two it replaces and its mirroring was not observed.
- **No variant was measured.** Every answer is a judgement made by looking.
- **The tenant list's zero-skew is a seeding artifact, not a portfolio.** 14,985 tenants
  against 3,256 contracts is what `scripts/seed.ts` produces, not what an operator has. The
  tenant row's *density* under B is therefore untrustworthy; what was judged there is the
  shape. The complexes figures, at 29 complexes and 242 units, are plausible and carry the
  result.
- **Only two of the five lists were mounted.** Contracts, payments and units were untouched;
  whether this rule wants extending to them was not asked.
- **The colour-vision case was not tested.** B leans on a hue where C leaned on contrast, and
  the reason C existed was partly that light-dark separates for more readers than red-green
  does. The chosen variant keeps the figure and the tooltip beside every glyph, so nothing is
  carried by colour alone — but that is an argument, not an observation.
- **Not seen at the smallest window the shell supports**, where three count clusters compete
  with the name for one row.

## Conclusion

Successful. The rule is **tint the live state**, one rule across both lists, and the total's
glyph becomes the layout grid.

The finding worth keeping is not that B won — it is *why the density argument against it was
wrong*. A tint applied to one figure inside a multi-figure cluster is not the same thing as a
tint applied to a row, and the reasoning that killed it on paper had silently substituted the
second for the first. That distinction is what would decide the same question on another list,
which is what makes it more than a preference between three screens.

Not recorded as a Decision on its own: which tone a count carries is the implementation of the
status vocabulary [ADR 0023](../../decisions/0023-a-status-is-an-icon-and-its-word-lives-in-the-tooltip.md)
already establishes, extended from statuses to counts. The extension itself is the durable part
and belongs in the design document this gated. The code is deleted.
