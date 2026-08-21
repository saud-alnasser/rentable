---
aep: 2.7.0
owner: repository
date: 2026-08-21
kind: prototype
---

> Three variants of the updates section, inside the existing `/settings` route, selected by the
> repository's own switcher.

# Hypothesis

**The updates section reads badly because the update conversation has no home.** Eight elements
appear and disappear on the page as a check progresses — two buttons, one of four callouts, a
four-figure panel, a progress bar, a second callout, a restart button — and what is left standing
afterwards outlives the reader's interest in it by the whole rest of the visit.

The fix is to give the conversation one place to happen. **The place the human described wins**:
the section becomes a row like every other row on the page, the check is an icon action in that
row's end, the two version figures render as the plates `startup-recovery.svelte` uses, and the
outcome is announced rather than deposited.

# Falsifier

Any one of these abandons it:

- The human picks a variant that keeps the conversation spread across the page.
- The human picks the row-and-plates variant but rejects the plates, which would mean the figures
  were never the problem and the accumulating outcome was.
- None of the three reads better than what ships today, which would mean the diagnosis is wrong
  and the section's problem is something other than where its parts live.

**The last one is the outcome worth guarding against.** A prototype whose three variants are
three readings of one diagnosis cannot discover that the diagnosis is wrong unless the option to
say so is written down in advance. It is written down here.

# Experiment

**Where it was built.** `apps/desktop/src/lib/prototype/updates/`, untracked, in the working
checkout — `[[rules/module-layout]]` under *Prototype code*, which says the working checkout and
names `git status` as what keeps it off a commit. `[[skills/prototype]]` step 2 says a worktree
instead, and the conflict was surfaced to the human under `[[policies/authority]]` rather than
resolved silently. **The human chose the working checkout**, and the deciding cost was that a
worktree has no shared cargo target directory and its own empty `apps/desktop/tauri/data/`, so
the section would have been judged on an install with nobody signed in and no rows in it.

**How it was mounted.** In place of `SettingsUpdates` on `routes/settings/+page.svelte`, so the
variants rendered inside the real page with the real rail, the real legends and the real
neighbouring rows. The version figure is real, off `useFetchSettings`.

**The diagnostics row went with it.** Requirement 3 is requirement 2's presentation decision
reached from the other side, so the diagnostics control was drawn as an icon in all three
variants rather than left as a text button under one of them.

**Two switcher bars**, which the switcher module stacks by design. The lower picked the variant.
The upper either jumped to one of seven states — never checked, checking, update available, up to
date, downloading, ready to restart, check failed — or armed what the next press of the control
would find.

**Nothing called the updater and nothing installed anything.** The transitions were timed
locally. This is the ui branch's own rule about not wiring a variant to a real mutation, and it
was also forced: a development build has no release to find, so five of the seven states are
unreachable against the real updater and the section would have been judged on two of them.

**The variants, in enough detail to survive the code.**

| | Where the conversation lives | What it bet |
| --- | --- | --- |
| **a, the row** | flat on the page | the human's description built literally. A `Field.Field` like its neighbours, the check as a `LayoutSurfaceAction` glyph on the end, the two version figures as the `dl` of muted plates `startup-recovery.svelte` draws, the release date and notes in a bordered panel only while there is a release, the progress as a strip below. **The outcome is a toast**: a check that finds nothing raises `settings.latestRelease()` and leaves the section exactly as it was. An available update adds a download glyph beside the check; an installed one swaps it for a power glyph. |
| **b, the tile** | one box, in every state | nothing about updates rendered outside a single bordered tile. The tile grew a second column when there was a second version to name, put its state on a line inside its own bottom border, disclosed the notes through a collapsible inside itself, and turned its own bottom edge into the progress bar. **The whole tile was the control**, so the version being read and the way to find a newer one were one object rather than a figure and a button referring to each other. |
| **c, the overlay** | off the page entirely | the page kept one row, one glyph and one version line permanently and never changed shape in any state. Pressing the glyph opened a dialog owning the figures, the notes, the progress, the install and the restart; closing it left the page as it was. A dot on the glyph was the only thing the page was allowed to say about updates without being opened. **This variant argued the section should not be a section.** |

# Observation

**The human ran the three and chose `a`.** What was reported is one sentence, and this section
records that rather than reconstructing a judgement nobody stated: *"a is the best option for
update section."*

So what is established is the ranking and not the reasoning behind it. Three things follow from
that, and they are written down because a later reader would otherwise read confirmation into
detail that was never collected:

- **The plates survived contact.** `a` is the only variant carrying the `startup-recovery.svelte`
  plate treatment on the idle path, and it is the one chosen, so the second falsifier did not
  fire. Whether the plates were what made it win is not established.
- **The toast survived with it**, because `a` is the only variant whose outcome leaves the page
  and it was not raised as an objection. This is the weakest of the three inferences and the
  first thing to re-examine if the built version reads wrong.
- **The diagnostics icon was not discriminated on.** It was drawn the same way in all three, so
  choosing between them says nothing about it. Requirement 3 comes out of this prototype
  unopposed rather than confirmed.

**What surprised the run, before it reached the human.** The variant the human described in
advance is the one that had to reach outside `settings/` to be built: `LayoutSurfaceAction` lives
in `layout/` and says in its own doc comment that it belongs to the application's own screens and
to no concept. `/settings` is a page rather than an application-own surface, so the winning
presentation puts a shell component on a concept page. That is a real boundary question the
prototype exposed and did not answer.

# Result

**Confirmed.** None of the three falsifying conditions fired. The variant that keeps the
conversation flat on the page won against one that consolidated it into a single object and one
that removed it from the page altogether, and it won carrying the plates.

# Conclusion

**Requirement 2's presentation is settled and requirement 2a is discharged.** The updates section
becomes a row with an icon action, two version plates, a release panel that exists only while
there is a release, and an outcome that is announced and not deposited.

**What the losers establish is worth more than the winner here**, because both were arguments
that the section is too large rather than badly arranged, and both lost. `b` said the section
should be one object; `c` said it should be one glyph and a dialog. The section staying a section
on the page, at roughly its current height, is therefore a decision that was tested rather than a
default that was never questioned. **Neither should be reopened without new information**, and
`c` in particular is the one that will look attractive again the next time the settings page feels
long.

**One question this did not answer**, and it goes to `/plan`: whether `LayoutSurfaceAction` moves
to `design/block/` or whether a settings page is allowed to import from `layout/`. The winning
presentation needs one of the two.

# Disposition of the code

**The losing variants, the switcher host and the staged scenes are deleted**, and the mount in
`routes/settings/+page.svelte` is reverted. `apps/desktop/src/lib/prototype/` holds only
`switcher.svelte` again, which is the repository's own machinery and was never this prototype's.

**The winning variant's markup was carried into `settings/component/updates.svelte` rather than
rewritten from nothing, on the human's instruction on 2026-08-21: "use the code just alter it to
fit as an actual impl."** That is a deliberate override of `[[skills/prototype]]`, which says
promoted code is rewritten under `[[modes/implement]]` rather than moved, and it is recorded here
as an override rather than presented as the default. `[[policies/authority]]` rank 1 is what
carries it.

**What survived the move, and what did not.** The arrangement, the snippet that draws a plate, the
class lists and the ordering of the two controls are the variant's. Everything that made it a
prototype was replaced rather than adapted: the seven staged scenes and their timers are gone in
favour of the real `useCheckForUpdate`, `usePrepareUpdate` and `useRestartApp`, the simulated
release is gone in favour of the real `AvailableUpdate`, and the error handling and diagnostics
recording a prototype skips were taken from the implementation being replaced rather than written
fresh. **So what shipped is the variant's presentation on the old implementation's machinery**,
which is the shape the override makes sense in, and it is worth being precise about because "use
the code" could also have meant shipping the timers.

**Two things the promotion forced that the prototype only exposed.** `SurfaceAction` moved from
`layout/component/` to `design/block/`, because `[[rules/frontend]]` puts a composite reaching
past the shell there and a settings row is past the shell; its three existing callers moved with
it. And it gained a `disabled` prop, which the startup screens never needed and the diagnostics
row does, because that row draws a folder it may not have been told the path of.
