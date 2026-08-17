---
aep: 2.2.0
owner: repository
date: 2026-08-17
kind: prototype
---

# Should a directory row be a spaced card that lifts, and how raised should it be at rest?

Verified against: Svelte 5.56 / SvelteKit 2, Tauri 2, Tailwind 4.3.3, `@tanstack/svelte-virtual`,
in the running desktop app against the developer database, 2026-08-12
Conclusion: Successful

The request was that the contracts, complexes and tenants directories become "cards separated by
a space" that "lift with a minimalistic animation" on hover. That is two questions wearing one
sentence — whether a row becomes a card at all, and how much elevation it carries before anyone
touches it — and the second cannot be answered in prose, because the whole difference between a
list that reads calm and one that reads busy is a shadow nobody can describe. Gated the design of
the eight interface corrections raised on 2026-08-12.

## Hypothesis

The candidate carried in was **quiet cards**: no shadow at rest, depth carried by fill colour
alone (_Even flat designs can have depth_, 190 — lighter than the ground reads as raised), with
elevation appearing only on hover. The expectation was that this would win on a list of this
density, because _Use shadows to convey elevation_ (180) ties shadow size to how much an element
demands focus, and a directory row demands none until it is pointed at — 24 rows each asserting
elevation is 24 things competing for an eye that came to scan.

## Method

Sub-shape A: the treatments rendered inside the real `/complexes`, `/tenants` and `/contracts`
lists, against the developer database, with the real sidebar, real search, real virtualized row
density and no seeding or purging. Three theories on one switcher, cycling all three directories
at once, since the treatment is the shell's and a rule that held on one list and not another
would not be a rule.

| | The rule |
| --- | --- |
| A | **control** — full-bleed rows, `border-b` between them, inside a framed container. As shipped. |
| B | **quiet cards** — 8px gap, `bg-card`, no shadow at rest; hover lifts 2px to the book's medium shadow (`0 4px 6px`). |
| C | **raised cards** — 12px gap, the book's small shadow at rest (`0 1px 3px`); hover lifts 3px to `0 10px 20px`. |

Both card variants drop the container's own frame, because a bordered box around bordered rows is
the ✗ on _Use fewer borders_ (238) and the ✓ there is a shadow doing the border's job.

Two things the shell had to change for any card to be possible, and they are the durable part of
the method rather than incidental:

- **The gap rides inside the virtualizer's row**, as the row's own bottom padding, rather than as
  a margin on the card. The block lays rows out at a declared height and does not measure them, so
  a margin would put every row a little below where the virtualizer believed it was, and the error
  would accumulate down the list.
- **The row's `overflow-hidden` cannot stand.** It exists so a row that outgrows its declared
  height clips visibly rather than colliding with the next one — but a card that lifts has to
  leave its row, and the clip cuts the lift off. The two cannot both hold, and the shipped
  treatment has to choose.

The card also needs horizontal inset inside the scroll viewport: setting one axis of `overflow`
makes the other `auto`, so a shadow at the viewport edge is clipped rather than drawn.

The code lived in `src/lib/prototype/` beside the switcher rather than under the protocol
directory, which cannot serve one — [[rules/module-layout]], under *Prototype code*, records why.

## Result

**C, chosen by the user at the running window.** The hypothesis was wrong: resting elevation beat
elevation-on-demand.

The reasoning that killed C on paper — that 24 rows each carrying a shadow is 24 things asking for
attention — treats a shadow as a claim about importance. At row scale and at this shadow size it
is not one; it is what makes the card read as a discrete object rather than as a band of colour.
B's cards, flat until hovered, read as regions of the page that happened to be tinted, and the
hover then had to do two jobs at once — say *this one* and say *these are objects at all*. C
having already said the second leaves the hover saying only the first, which is the job it is
good at.

This is the same shape of error as the one `directory-row-colour` recorded: an argument about
aggregate visual load, made about a property that is not actually operating per-row.

**The 12px gap travelled with the shadow, and the pairing is not incidental.** A card with resting
elevation needs more room around it than a flat one — the shadow occupies space that reads as
belonging to the card, so at 8px the cards of C would have crowded in a way B's did not at the
same measure (_Avoid ambiguous spacing_, 96: the gap around a group must beat the gap inside it,
and a shadow eats into the gap around).

## Limitations

- **No variant was measured.** Every answer here is a judgement made by looking.
- **Arabic was not recorded.** The window was available for it; no RTL observation came back. A
  shadow and a vertical translate are direction-neutral in principle, but the treatment has not
  been seen mirrored, and this is the third consecutive prototype on these rows to leave RTL open.
- **Dark mode was not separately judged.** The hairline ring each card carries exists because the
  book is silent on dark mode and a shadow reads as nearly nothing on a dark ground — that is an
  argument, and whether the ring is doing the job was not confirmed against both themes.
- **The tenant row is about to change under this answer.** It was judged holding one count cell;
  the design this gated gives it six. Whether C survives that width, particularly at the smallest
  window the shell supports, is not settled here — the same corner `directory-row-colour` left
  open for the three-count cluster, now widened.
- **Scroll cost was not re-measured.** `interface-performance-baseline` timed frames against
  full-bleed rows; C adds a shadow and a ring per visible row and removes a clip. Nothing here
  says what that costs, and the earlier figures no longer describe this list.
- **The lift was not seen under `prefers-reduced-motion`.** The variants gate the transform on
  `motion-safe:`, so the reduced case is a class nobody exercised.
- **Grouped lists were not judged.** The contracts work queue pins a group header, and the pinned
  row keeps a solid background so the cards scroll under it. That interaction was in the build but
  was not the thing being looked at.

## Conclusion

Successful. A directory row becomes a **card with resting elevation** — the book's small shadow, a
12px gap, lifting 3px to a larger shadow on hover, with a hairline ring carrying the separation
that a shadow cannot carry in dark mode.

The finding worth keeping is *why the quiet variant lost*, because that is what would decide the
same question on another surface: a resting shadow is not a per-row assertion of importance, it is
what makes a row read as an object. Once it has said that, the hover is free to say **this one**;
without it, the hover has to say both, and does neither cleanly.

Two mechanical facts are worth keeping with it, because both are traps rather than preferences:
**the gap belongs inside the virtualizer's row**, or the layout drifts down the list; and the
row's protective `overflow-hidden` and a lifting card are mutually exclusive, so shipping the lift
means giving up the clip that made an outgrown row visible where it was caused.

Not recorded as a Decision. Which treatment a directory row wears is the implementation of the
list block's presentation, not an architectural choice; the durable part belongs in the design
document this gated.

**The chosen variant was promoted rather than deleted, on the user's instruction** — `/prototype`
would have discarded the code and rebuilt it. What was promoted is C alone: the switcher, the two
rejected variants and the shared variant state came out, and the treatment moved into the list
block as one exported declaration the three directories read. The rejected variants survive only
in this file, which is the record they were built to leave.
