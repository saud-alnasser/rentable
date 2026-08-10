---
owner: repository
status: accepted
load-when: a surface is gaining animation or a transition, or the reduced-motion preference is in question
sources: [src/app.css, src/lib/design/primitive/]
supersedes: []
superseded-by: []
---

# Reduced motion is guarded once, globally, and the looping indicators keep moving

ADR 0016 left open whether the generated primitives honour `prefers-reduced-motion`, and asked for
the answer to be checked against the installed package rather than assumed either way. The check ran
under #273: `tw-animate-css` 1.4.0 carries no occurrence of `prefers-reduced-motion` anywhere in its
distributed stylesheet, and neither did `src/`. They did not honour it — an accessibility defect that
had been shipping since the primitives were generated. Two things are decided here: **where the guard
lives**, and **what it deliberately does not reach**.

**The guard is stated once, globally, in `src/app.css`**: every CSS transition zeroed, and keyframe
animation removed from anything carrying `data-state` or `data-motion`. Global because
`design/primitive/` is a generated catalogue — a primitive added later inherits the guard without
being edited for it, which is the one property per-primitive gating cannot promise. The narrow
selector is not a compromise for a broad one: the whole generated animation surface is reachable
through those two attributes, because every `animate-in` / `animate-out` usage sits behind a
`data-[state=…]` or `data-[motion…]` variant.

**The three looping indicators are exempt** — the spinner, the skeleton pulse, and the OTP caret. A
spinner is the only thing on screen saying work is in progress, and a frozen one reads as a hung
application rather than a calmer one. None of the three carries either attribute, so the exemption
falls out of the selector rather than being a list somebody has to maintain.

## Considered Options

**Gate each primitive with `motion-safe:`.** Rejected. It is the mechanism `.claude/rules/frontend.md`
names for a surface's own motion, and it is already to hand — but `design/primitive/` is regenerated
rather than authored, so every primitive added later would arrive ungated and the defect would recur
by exactly the route that produced it the first time.

**Freeze everything, including the loops.** Rejected on the trade-off above. It is the stricter
reading of the preference and the one an automated audit would score higher, and it is still wrong
here: the preference asks for motion that does not distract, not for the removal of the only signal
distinguishing a working application from a hung one.

## Consequences

**Removing motion cannot strand a surface half-open, and that is what made a blanket rule safe rather
than reckless.** `bits-ui` 2.18.1 unmounts through `element.getAnimations()` and proceeds immediately
when that set is empty; `vaul-svelte` 1.0.0-next.7 closes on a `setTimeout`. Neither — nor
`svelte-sonner`, `embla-carousel`, or `mode-watcher` — listens for `transitionend` or `animationend`.
A rule that zeroed durations under a library waiting on an animation event would deadlock the surface
it was trying to calm.

**`!important` is on the transition rule alone**, to reach the drawer, whose transition `vaul` writes
inline. The animation rule is unlayered and already outranks Tailwind's utilities layer, so it needs
none — and a reader who assumes the two rules are symmetric will add an `!important` that does
nothing.

**A surface composing its own keyframe animation still gates it itself**, whenever the element
carries neither attribute. The global rule covers what is generated; `.claude/rules/frontend.md`
carries the requirement for everything composed here.

**ADR 0016's decisions stand, and nothing here supersedes them.** Motion is still always a response,
and still built from what is installed; this answers the question its Consequences left open and
decides what that answer implies. That open paragraph is now stale where it sits, and the drift is
recorded in
[`adr-0016-primitive-reduced-motion-is-now-known.md`](../evidence/drift/adr-0016-primitive-reduced-motion-is-now-known.md)
rather than repaired in place — a committed ADR's prose is frozen.
