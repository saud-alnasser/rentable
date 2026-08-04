---
status: accepted
---

# Motion always responds to something, and is built from what is already installed

Every animation in this repository was an artifact of code generation: all 41 `animate-in` /
`animate-out` occurrences sat inside `design/primitive/`, animating because bits-ui stamps
`data-state` on those components, and nothing this repository composed for itself — no block,
no concept component, no layout, no route — carried a single transition, duration or keyframe.
The application therefore felt inert exactly where the work had gone. Two things are decided
here: **what motion is for**, and **what builds it**.

**Motion is always a response** — to an interaction (hover, press, focus, scrolling to
something) or to a trigger (data arrives, state changes). It never starts by itself and it
never loops. That is the checkable form of #211's *"elegance here means removing decoration"*:
what #246 deleted was decoration that sat there permanently — blur, gradients, colour blobs —
and motion that answers the user is not that. The two requirements agree, so nothing here
supersedes.

**It is built from Svelte's built-ins and Tailwind, with no motion library**, split by what
causes it: CSS for motion the user causes, Svelte's `in:`/`out:` for motion the data causes
that CSS cannot reach. Evidence:
[`svelte-motion-mechanism.md`](../evidence/research/svelte-motion-mechanism.md).

## Considered Options

**Motion (motion.dev)** — rejected on availability, before its features were weighed. It ships
first-party integrations for React, JavaScript and Vue; **there is no Svelte package**. Every
Svelte route to it is a community wrapper, which would put an unofficial adapter beneath the
animation layer of an application shipped inside an installer.

**AutoAnimate** — rejected, and it is the close one: 3.28 KB gzipped, a genuine Svelte action,
and `prefers-reduced-motion` honoured with no configuration. It animates three events — a child
added, removed, or **moved**. The first two are what `in:`/`out:` already do, and *moved* is the
one this repository cannot use at all, because the list shell absolutely positions its rows. It
would be a third mechanism, alongside `tw-animate-css` and Svelte's own, bought for the single
feature that does not work here.

**One mechanism rather than two** — rejected in both directions. CSS alone cannot animate an
element leaving, because Svelte removes the node before any CSS can run; Svelte transitions
alone would duplicate what the 20 generated primitives already do correctly through
`data-state`. The split is by cause, and the cause is observable, so the rule is checkable in
review rather than a matter of taste.

## Consequences

**Reordering cannot be animated, and that is a property of the shell rather than of this
decision.** FLIP — the technique under `animate:flip`, AutoAnimate, and every layout-animation
feature in every library — measures an element's position before and after in normal flow.
`design/block/list.svelte` absolutely positions each row at a computed offset and mounts only
what is near the viewport, so no library can animate a record moving between groups. The case
that wants it most is the contracts queue, where a contract changes attention rank when a
payment lands. **Revisiting reorder motion means revisiting the shell**, and any redesign of
that shell should decide it deliberately rather than discover it.

**Reduced motion is opt-in in both mechanisms, so it is a requirement rather than a default.**
Neither Svelte's transitions nor Tailwind's utilities consult `prefers-reduced-motion` on their
own. Tailwind supplies `motion-safe:` / `motion-reduce:` variants and Svelte 5.7+ exports a
`prefersReducedMotion` MediaQuery, but both must be reached for. A surface that animates without
one of them is unfinished, not merely unpolished.

**Whether the generated primitives honour the preference today is unknown.** The research could
not establish from a primary source that `tw-animate-css` guards its animations, which means the
20 primitives may currently ignore the setting — an accessibility defect predating this
decision. It is checked against the installed package rather than assumed either way.

**Application rides the tickets that already exist**, exactly as Rhea's geometry does under
#211. There is no retrofit programme: a surface gets motion when a ticket rebuilds it, and
`.claude/rules/frontend.md` carries the requirement so the next ticket reads it.

**Nothing was measured.** Per-element entry motion inside a virtualized list is unquantified,
and #211 holds performance as acceptance rather than aspiration. The cost was deliberately
deferred to a later optimisation pass, so that pass owns the question and this decision does
not claim to have answered it.
