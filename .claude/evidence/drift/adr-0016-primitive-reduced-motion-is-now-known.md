# ADR 0016 records as unknown something #273 established

Checked against: `574200a` (`main`), with `tw-animate-css` 1.4.0 and `bits-ui` 2.18.1 installed
Falsifies: `.claude/decisions/0016-motion-responds-and-uses-what-is-installed.md`, Consequences,
the paragraph beginning *"Whether the generated primitives honour the preference today is unknown"*
Area: the interface overhaul — map [#211](https://github.com/saud-alnasser/rentable/issues/211)

## What was checked

ADR 0016 deferred a question rather than answering it:

> **Whether the generated primitives honour the preference today is unknown.** The research could
> not establish from a primary source that `tw-animate-css` guards its animations, which means the
> 20 primitives may currently ignore the setting — an accessibility defect predating this
> decision. It is checked against the installed package rather than assumed either way.

The check was run against the installed package, which is what the ADR asked for. The answer is
that **they did not**: `tw-animate-css` 1.4.0 contains no occurrence of `prefers-reduced-motion`
anywhere in its distributed stylesheet, and neither did `src/`. The defect was real and had been
shipping since the primitives were generated.

#273 fixed it, so the ADR now records as open a question that is both answered and closed.

Two further facts were established on the way, and neither is in the ADR:

- **The primitives' motion is reachable from one place.** All 40 `animate-in` / `animate-out`
  usages sit behind a `data-[state=…]` or `data-[motion…]` variant, so the whole generated
  animation surface is selectable as `[data-state], [data-motion]` without touching a file.
- **Nothing here waits on an animation event.** `bits-ui` 2.18.1 unmounts through
  `element.getAnimations()` and proceeds immediately when that set is empty; `vaul-svelte`
  1.0.0-next.7 closes on a `setTimeout`. Neither library — nor `svelte-sonner`, `embla-carousel`,
  or `mode-watcher` — listens for `transitionend` or `animationend`. Removing motion therefore
  cannot strand a surface half-open, which is what made a blanket rule safe rather than reckless.

## To re-run the check

```bash
grep -rc 'prefers-reduced-motion' node_modules/tw-animate-css/dist/    # expected: 0
grep -rn 'animate-in\|animate-out' src/lib/design/primitive/ | grep -v 'data-\['   # expected: 1 line, data-motion
grep -rl 'transitionend\|animationend' node_modules/bits-ui node_modules/vaul-svelte   # expected: no matches
```

## What it reaches, and what it does not

The ADR's decision is untouched — motion still responds to something, and is still built from what
is installed. Only the open question in its Consequences is stale, and it is stale in the
direction that costs work: a reader planning a surface would either re-run a check that has been
run, or design around a defect that no longer exists.

One thing #273 settled is not in the ADR at all and is closer to a decision than to a fact: under
reduced motion the three looping indicators — the spinner, the skeleton pulse and the OTP caret —
**keep moving**, because a spinner is the only thing on screen saying work is in progress and a
frozen one reads as a hung application. It was taken with the user's approval during the build and
recorded where the code is (`src/app.css`, `.claude/rules/frontend.md`), which is enough for the
next surface. Whether it clears the bar in `.claude/policies/decisions.md` is `/design`'s call.

## Why this is a finding rather than a fix

A committed ADR's prose is frozen, and a falsified Decision is never healed inline —
`.claude/policies/decisions.md` and `.claude/policies/knowledge.md` respectively. `/implement`
found this while building #273 and carried on with the build.
