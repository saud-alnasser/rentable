---
aep: 2.7.0
owner: repository
date: 2026-08-20
kind: prototype
---

<!--
  A process note, because it changes how much this file is worth. The four variants were built
  before the Hypothesis and Falsifier below were written down, which is the wrong order and the
  one [[templates/prototype.template]] warns about. They are written here before the run rather
  than before the build, so they are weaker than the shell prototype's beside them: a falsifier
  chosen with the variants already on screen can be chosen to fit them. Discount accordingly.
-->

# Hypothesis

**What is wrong with the update-recovery and startup-failure screens is not how much they say. It
is that nothing on them distinguishes a broken application from a working one, so the fix belongs
to the surface all seven of these screens share rather than to these two.**

`[[rules/interface]]` under *Application surfaces* converges starting, signing in, failing,
recovering and reporting an unanticipated error onto one block, on the stated ground that none of
them presents a concept's records. That is still right. What it did not decide is whether all
seven should therefore look **identical**, and today they do: the same card, the same weight, the
same colour, whether the application is loading normally or cannot open its database.

The two screens have their own faults underneath that, and the variants below cover them:

- **Recovery says the same thing three times.** Its description names the version it was updating
  to, a boxed figure under it restates the previous version, and a paragraph after that explains
  the same situation again. This repository has closed on exactly this before, as *no figure is
  stated twice on the page* ([[efforts/surfaces-the-overhaul-left-behind]]).
- **Failure hands over a raw string and one button.** The message renders as muted 12 point text
  and there is nothing to do with it. **The diagnostics file exists and nothing offers it**, which
  is the one thing a person meeting this screen actually needs next.

# Falsifier

**The human prefers variant 2 or 3.** Either of those keeps the fix inside these two screens and
leaves the shared block alone, which refutes the hypothesis directly: it would mean the screens
were too talkative or the wrong shape, and not that the surface is silent about failure.

Two more, either of which is enough on its own:

1. **The band reads as alarm rather than as information.** A startup failure is frightening enough
   without the interface agreeing, and a tinted band across the top of the only card on screen is
   the loudest thing this application would do anywhere.
2. **Variant 4 wins and the other six screens then look wrong beside it.** The tone cannot be
   given to two screens and withheld from five without the block having two shapes, which is the
   convergence the rule exists to hold. **If 4 wins, the other six are in scope**, and this stops
   being a two-screen change. That has to be accepted going in rather than discovered afterwards.

# Experiment

**Four presentations of both screens, on a second switcher bar, with the state bar pinning which
of the two screens is on.** Position one renders the real `startup-error.svelte` and
`startup-recovery.svelte`, so the comparison is against what ships rather than a copy of it.

Both screens draw on the bare frame, which is what the shell prototype settled: an application
that is not running does not get chrome.

| | Where the fix sits | The body | Actions |
| --- | --- | --- | --- |
| **1 current** | nowhere, this is today | prose, and recovery's boxed figure | retry, and the previous release |
| **2 quiet** | in the two screens | one line, everything else folded behind a disclosure, including recovery's second action | retry alone |
| **3 report** | in the two screens | label-and-value rows, each fact stated once, and a way to the diagnostics folder | both, primary last |
| **4 toned** | in the shared surface | almost nothing | both, primary last |

**Variant 4 does not render `StandaloneSurface` at all.** It renders the same geometry with a
tinted band and a glyph above the title, which is what the shared block would grow if it wins. The
two screens get different tones from each other as well: an update that needs finishing is not the
same event as a database that would not open, and today they wear the same face.

**How to run it.**

```bash
pnpm dev:desktop
```

Pin the state bar to `recovery` or `failed to start`, then cycle the failure bar. The failure bar
changes nothing in any other state.

`pnpm check` passes on 9613 files and eslint is clean with all of it mounted.

# Observation

**Variant 4 won, and it won on the band.** The human picked it on 2026-08-20 and the two variants
that kept the fix inside these two screens both lost. So the hypothesis stands: what was wrong is
that nothing distinguished a broken application from a working one, rather than that these screens
said too much or said it in the wrong shape.

**It won with three corrections, and all three are about the body rather than the band:**

1. **Both actions want a glyph.** The current screens have none, and neither did round one.
2. **The facts want the treatment the current recovery card already gives its version** — a muted
   plate with a small uppercase label over the value. **Round one had thrown that away**, which is
   the part worth writing down: it was cutting the recovery card's repetition and took the one
   element of that card that was working out with it.
3. **The startup failure has to say more, title included.** A title naming no cause over a body of
   one muted line, on the most alarming event in the application.

**Round two rebuilt variant 4 against those three** and was itself corrected, which is the entry
worth having:

- **The startup failure was over the top.** Round two had given it the same labelled plates
  recovery got, and a startup failure has no figure worth a plate. It is prose: what stage failed,
  that nothing is at risk, and what the application reported. **Recovery keeps its plates**,
  because a version number is a fact somebody reads off the screen and repeats.
- **The plates were in the wrong order.** Previous version first, the version being upgraded to
  second.
- **The actions belong in the band as glyphs with tooltips**, not as a row of labelled buttons
  under the body.
- **Stop cloning the shared block.** Rounds one and two hand-rolled the card's geometry to
  demonstrate a tone, so the proposal and the thing it proposed about had drifted apart.

**Round three renders the real block.** `standalone-surface.svelte` grew `tone`, `neutral` draws
byte-for-byte what it always drew, and the two screens declare `notice` and `failure`. The corner
snippet that block already had, documented as "a control in the card's top corner, where a reader
looks for one", is where the glyphs go. **The failure screen also reaches the diagnostics folder,
which nothing in the application offers today.**

**Round four is two more corrections, and both are the same correction twice.**

- **The failure screen is still saying too much.** Round three cut it from plates to three
  paragraphs and the answer was one description, nothing else. It now says what could not be
  opened, that nothing in it is at risk, and what to try. **The reported error left the screen
  with the body** and is reached through the log control.
- **The glyphs are not eye-catching enough**, which is the second half of a mistake round three
  made: it borrowed `RecordActionControl`. That control rests deliberately quiet and **its own
  documentation gives the reason** — a glyph at rest would be the only chroma on a record surface
  holding a page of other things. **None of that reasoning survives the move.** These are the only
  controls on a card that has stopped the whole application, so nothing competes and quiet buys a
  reader who cannot find the way out. Round four writes the surface's own control: the way past
  filled, the other outlined on the card's ground, both a size up, tooltips opening downward
  because the band is at the top of the card.

*Worth recording rather than tidying away: reusing an existing control looked like the disciplined
choice and imported an argument that did not hold here. The pixels were only the symptom.*

# Result

**Confirmed, against a falsifier that named the alternative explicitly.** Preferring either of the
two in-screen variants would have refuted it, and neither was preferred.

The second falsifier, that the band would read as alarm rather than information, did not fire.
Worth noting why it might not have: the two events get different tones from each other, so the
loudest treatment is spent only on the one that has earned it.

**The third falsifier fired as designed and was accepted rather than avoided.** It said that if
variant 4 won, the other five screens on the block come with it. They do, and the human took that
knowingly, having been told before choosing.

# Conclusion

**The fix belongs to the shared block, and the shape of the requirement matters more than the
appearance.** Requirement 15 of [[efforts/capabilities-only-one-surface-got/spec]] was rewritten
on the strength of this run: the block gains a tone, and what is required is that **every one of
the seven screens declares which tone it is**, with most declaring neutral.

*The version of that requirement written earlier the same day forbade "two of seven wearing a
treatment the other five do not", and it would have forbidden this answer. A tone that only
failure states use is correct; a screen that never declares is the actual defect. The requirement
was written before the answer existed and was written too tightly, and it is recorded here because
a requirement corrected by its own evidence is the kind that gets quietly re-broken later.*

# Disposition of the code

**Landed 2026-08-20**, at the human's instruction to tailor the prototype into the implementation
rather than delete it and build it again from the record.

- `failure-toned.svelte` became `layout/component/startup-error.svelte` and
  `layout/component/startup-recovery.svelte`. It was one component switching on a `kind` prop
  because a switcher needed one entry point; the two screens are not the same shape, so as
  implementation they are two files and neither carries the other's branches.
- `surface-action.svelte` became `layout/component/surface-action.svelte`. Not
  `design/block/` beside the surface it sits in: [[rules/frontend]] reserves that for composites
  shared by concepts, and this is shared by no concept.
- `standalone-surface.svelte`'s `tone` lost its PROTOTYPE mark and became the real prop, and every
  screen on the block now declares one at its call site.
- **Deleted**: `failure-surface.svelte`, the dispatcher, and the failure bar.

**Three keys went out with the old screens**: `failedToStartTitle`, `failedToStartDescription` and
`recoveryDescription`, in both locales. The two screens that read them no longer exist in the shape
that needed them.

**The keys this round added stay**, under `layout.startup` and `layout.accountMenu`, in both
locales, plus the regenerated `i18n-types.ts`. The prototype was moved off hardcoded English and
onto `$LL` at the human's instruction, so those keys are the effort's work rather than the
prototype's.

**Arabic has still not been looked at.** It was carried through every round and every landing
without once being on screen, and the recovery plates are the newest thing that mirrors. Criterion
12 is where that is owed.
