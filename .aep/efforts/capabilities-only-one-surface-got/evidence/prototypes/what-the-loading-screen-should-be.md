---
aep: 2.7.0
owner: repository
date: 2026-08-20
kind: prototype
---

<!--
  Same process note as the failure-screens file beside this one: the variants were built before
  the Hypothesis and Falsifier below were written down, which is the wrong order. Written before
  the run rather than before the build, so discount them against the shell prototype's, which were
  written first.
-->

# Hypothesis

**The loading screen does not want a card, because a card is for something you read or act on and
loading is neither.**

It has never been designed. It is `StandaloneSurface` with `busy` and four words, and it looks the
way it looks because six other screens needed a shared block and this one came along for the ride.
Those six ask the reader something or tell them something they have to take in. This one asks
nothing, says one word, and on a good launch is gone in under a second. Giving a non-event the
same bordered, shadowed, ring-lit panel as a failed startup is the block's convergence reaching
one screen too far.

# Falsifier

**The human prefers either variant that keeps the card.**

Two of the seven do, for opposite reasons, so a preference for either refutes this:

1. **Position 1**, today's card, would mean the card is doing something the argument above cannot
   see.
2. **Position 3**, a card that names the stage it is on, would mean the screen's problem was that
   it says too little rather than that it is shaped wrongly. That is a live possibility: the only
   launch anybody actually looks at is a slow one, and on that launch "loading the app" is the
   least useful sentence available.

A second falsifier, independent of which wins: **the mark pulsing reads as a fault rather than as
progress.** A logo throbbing on an otherwise empty window is one of the easier ways to make an
application look broken while it is working perfectly. **Position 5 exists to settle this one
cleanly** — it is position 2 with the motion moved off the mark and nothing else changed, so a
preference between the two is a verdict on the pulse alone rather than on the composition.

# Experiment

**Seven loading screens on a third switcher bar**, with the state bar pinned to `loading`. Six of
the seven draw on the bare frame, which is what the shell prototype settled: an application that is
not running does not get chrome. The seventh breaks that on purpose, and is marked.

| | The card | The motion | What it says |
| --- | --- | --- | --- |
| **1 current** | yes, the shared block with `busy` | a small spinner | "loading the app" |
| **2 splash** | none | the mark pulses | one muted line |
| **3 staged** | yes | a small spinner | the stage it is on, over "loading the app" |
| **4 progress** | none | a bar fills | the stage, and 1/4 |
| **5 orbit** | none | a ring turns, the mark holds still | one muted line |
| **6 deferred** | none | position 5, after a threshold | nothing, until it is slow |
| **7 settling** | none | the skeleton shimmer | nothing; it draws the rail |

**Three axes, and a preference usually belongs to an axis rather than to a whole variant.** Whether
a card belongs at all (1 and 3 say yes). What the motion means — indefinite motion says *something
is happening*, while position 4's bar claims *this much is done*. And when the screen should appear
at all, which only position 6 answers.

**Position 6 is a rule, not a look.** It draws nothing until the launch has been slow enough to be
worth reporting, on the argument that a screen which flashes past in three hundred milliseconds is
noise, and worse, is the thing that makes a fast launch *feel* like a slow one. What it renders
after the threshold is position 5 unchanged, so choosing it means choosing it *and* one of the
others. Judge it by reloading with the pin on `loading` and watching the first second; the launch
it is really about — the fast one, where the screen never happens — is the one this bar cannot show.

**Position 7 contradicts requirement 6 and picking it reopens that requirement.** It draws the
rail's silhouette in placeholder blocks, which is chrome before there is anything behind it. What it
buys is the reason most applications do it: the window fills with the geometry it is about to keep,
so nothing jumps when the application arrives. What it costs beyond the requirement is that a
skeleton is a promise, and this one can be a lie — three of the eight startup paths end at the
sign-in wall, a failed startup or an update recovery, and each of those has just shown a person the
shape of an application they are not going to get.

**Position 4's bar is the most expensive thing on this bar to make true.** Four equal steps over
four stages that cost wildly unequal times gives a bar that races to three quarters and sits there,
which reads as stuck at exactly the moment it promised not to. Honest means plumbing the stages
*and* weighting them, which is strictly more work than position 3's naming.

**The stage cycling in variants 3 and 4 was faked in round one and is real in round two.** Nothing plumbed a
stage through, so both variants walked four of them on a timer to show what they read like, and the
cost of wiring it for real was named so that neither could win on a faked mechanism without that
being visible. **The human chose variant 4 and asked for the stages to be actual stages**, so they
now are: `startup-stage.svelte.ts` holds five, and `routes/+layout.svelte` reports each one at the
await it already performs.

**Variant 2 carries no product name**, which holds
[[efforts/the-shell-says-whose-workspace-this-is]] requirement 5: the window title, the taskbar and
the installer have all named the application before this screen gets a turn.

**How to run it.**

```bash
pnpm dev:desktop
```

Pin the state bar to `loading`, then cycle the loading bar. It changes nothing in any other state.
Position 6 needs a reload rather than a cycle, because what it is showing is the first second.

# Observation

**Round one, three variants.** The human asked for more before choosing, which is itself an
observation: three positions did not span the question. Four more went up, and the axes they
disagree along got written down above rather than left implicit.

**Round two, seven variants. Position 4 chosen** — no card, the mark still, a bar filling over the
named stage — **with one correction: the stages have to be actual stages.**

That correction is the interesting part of the round. The variant was built with a faked timer and
labelled as faked, and the thing that made it win is the thing the fake could not deliver: a bar
only beats a spinner if it is *true*. A bar walking a timer is a spinner that has learned to lie.
So the stages were plumbed for real, and two things surfaced immediately that the timer had hidden:

1. **Stage one can never be seen.** Nothing in the tree renders until `isI18nReady`, which is set at
   the end of the settings-and-locales stage. The application's true first frame is the empty
   `{:else}` div in `routes/+layout.svelte`, not the loading screen. A loading screen that is absent
   for the first stage of loading fails at its one job, and no variant on this bar would have
   revealed that, because all seven were being drawn by a bar that pinned the state *after* startup.
2. **Signing in and retrying a session re-enter at stage three**, because that is where
   `continueStartup` begins. The bar starts those paths at three fifths, which is honest and looks
   peculiar.

Both are recorded in requirement 16 as work rather than left here.

# Result

**Refuted, and usefully.**

The hypothesis was that the loading screen does not want a card. The winner has no card, so the
letter of it survives — but it won on an argument the hypothesis never made. What decided it was not
card versus no card. It was **indefinite motion versus a claim about progress**: a spinner and a
pulse look the same at half a second and at forty, and the winner is the only position that says how
much is done rather than that something is happening.

Positions 1 and 3, the two that would have refuted the hypothesis on its own terms, both lost — and
by the falsifier as written that reads as confirmation. Calling it confirmed would be scoring the
falsifier rather than the reasoning, so it is recorded as refuted with the real conclusion below.

**Falsifier two — the pulsing mark — was not settled.** Position 5 existed to isolate it and the
question never got that far, because the winner has no mark-motion at all. It stays open only in the
sense that nothing now depends on it.

# Conclusion

**A loading screen's job is not to be looked at; it is to be believed.** Every position here was
designed around what the screen should *look* like, and the one that won is the one that changed
what the screen *knows*. The design question turned out to be a plumbing question, and none of the
seven variants would have found that on its own — the human's correction did.

**Convergence was the right diagnosis and the wrong scope.** This screen did inherit its shape from
six others that needed a shared block, and it should not have. But the fix is not a different shape;
it is that this screen has something to report and the others do not.

**Two defects were found by making a prototype honest.** That is worth generalising: the faked
mechanism was labelled honestly and still hid both of them, because a fake answers the question you
asked it and stays silent on the ones you did not. Where a variant fakes a mechanism it is going to
be judged on, wiring it is cheaper than it looks.

# Disposition of the code

**Landed 2026-08-20**, at the human's instruction to tailor the prototype into the implementation
rather than delete it and build it again from the record.

- `loading-progress.svelte` became `layout/component/startup-loading.svelte`, replacing the card.
  It is now the one application-own screen that does not render through the standalone surface, and
  that block's own documentation says why.
- `startup-stage.svelte.ts` became `layout/startup-stage.svelte.ts`, and the five
  `reportStartupStage` calls in `routes/+layout.svelte` lost their PROTOTYPE marks. This is the
  mechanism requirement 16 names.
- The five stage keys in both locales — `stageSettings`, `stageAccount`, `stageWorkspace`,
  `stageChanges`, `stageRecords`. `stageAlmost` went: it named a moment rather than a step, and
  every other stage names the await it stands for.

**Deleted:** `loading-surface.svelte`, `loading-splash.svelte`, `loading-staged.svelte`,
`loading-orbit.svelte`, `loading-deferred.svelte`, `loading-settling.svelte`, and the loading bar
from `shell-bars.svelte` and `shell.svelte.ts`.

**Two things the landing does not do**, both named in requirement 16 as work rather than left to be
found later: the bar's five steps are still equal fifths over stages that cost unequal time, and
the first stage still cannot be drawn.

**Not carried, and deliberately:**

- **Position 6's threshold.** It is a rule rather than a look, so it can be worn later by the
  winner, and nothing about the choice rules it out. It is not proposed now because the finding
  above makes the first stretch a blank window already — adding a deliberate delay on top of an
  accidental one is two answers to a question that has not been asked properly yet.
- **Position 7's skeleton.** It contradicts requirement 6 and did not win, so requirement 6 stands
  unreopened.
