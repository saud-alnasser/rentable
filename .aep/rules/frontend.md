---
aep: 2.7.0
owner: repository
date: 2026-08-23
kind: rule
paths:
  - apps/desktop/src/lib/**
  - apps/desktop/src/routes/**
  - apps/desktop/src/app.css
  - packages/design/src/**
use-when: "writing or changing Svelte components, routes, styles, or client state"
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when a frontend file is read and costs nothing
  otherwise.
-->

# Frontend

## Svelte

Svelte 5 runes throughout — `$state`, `$derived`, `$props`. No Svelte 4 reactive
statements, no `export let`.

## Data access

Components never call the API directly. A concept's `query.ts` wraps it in TanStack Query,
and components use those hooks. Query v6 takes a thunk, not an object.

Each domain's query module composes its key set from the workspace prefixes in
`design/query.ts` and exports it. Every data mutation invalidates through the shared
helper there, and a full pass with no touch-set — a sync pull, a day crossing — through
the root helper beside it; an invalidation that spells a key out inline drifts the moment
the key changes. Settings and remote-sync keep their own keys and invalidations.

Toast behaviour on a mutation goes through the shared success and error handlers, never
through direct toast calls in a component — that is what keeps `BAD_REQUEST` messages
reaching the user and everything else reading as an unexpected failure.

## Components

- **`design/primitive/` was generated once and is owned now.** It holds shadcn-svelte
  primitives, and the two operations on it are not the same one: **a new primitive is added
  through the CLI; an existing primitive is changed by hand.** The generator writes whole
  files rather than merging, so the flags that make it replace one already here — `add
  --overwrite`, `init --reinstall` — discard whatever this repository put in it. Adding is
  safe; replacing is what there is no way back from. [[references/shadcn-svelte]] has both.
  What they would discard is load-bearing. Thirty-four of these files, across seventeen
  primitive families, read the i18n store — for a translated string, or for `dir` on the
  rendered element. A regenerated file carries neither and still compiles and renders, so
  the damage shows up as a silently English, silently LTR primitive rather than as an
  error. *It was eighteen until 2026-08-23, when `spinner` crossed into `@rentable/design` with
  #777, and it falls to seven when the direction-only families cross at #779. Read the count as
  the shape rather than the figure; what makes it right is the argument, not the arithmetic.*

  **A family that has crossed is a second hazard rather than one fewer.** The CLI still points
  at this application: `components.json` maps `ui` to `$lib/design/primitive`, and repointing it
  is #783's. So `add --overwrite spinner` today writes a fresh `$lib/design/primitive/spinner/`
  into a tree no import points at any more, and what a reader then finds is two spinners, one of
  them unreachable and neither of them announcing which.
- **App-level composites go in `design/block/`**, never in `design/primitive/`. App-level
  means shared by concepts; the application shell's own components are not, and live in
  `layout` (#257).
- **`components.json`'s alias keys are the CLI's vocabulary, not ours.** `components`,
  `utils`, `ui`, and `hooks` each route a different kind of generated file, so they are
  not interchangeable and cannot be merged into one — which is why a `utils` key survives
  here against the naming rule. Repoint every one of them when a directory moves.
  **State `ui` and `hooks` even though they are optional**: their defaults are
  `$lib/components/ui` and `$lib/hooks`, so omitting them makes the next generated
  primitive recreate the plural `components/` tree this layout removed. `lib` is the only
  one omitted, because `$lib` is genuinely its default.
- **Domain UI lives with its domain**, not in the shared component tree.

## Styling

Tailwind v4, configured CSS-first — there is no JS config file to edit. **The configuration is
in two files and the split is by owner.** `packages/design/src/lib/tokens.css` is **the token
layer**: what the product's surfaces are drawn from, and the name used for it throughout this
rule. It holds the palette, the tone colours, the radius, the shell breakpoint, and the global
rules any Rentable client wants. `apps/desktop/src/app.css` imports it, registers the package with
`@source`, and holds only what belongs to this window.

**The token layer's own header states the consumer contract**, and it is three lines rather than
two: `@import 'tailwindcss'` has to precede the package import, or `@theme`, `@layer base` and
`@apply` resolve against nothing. Both that and a missing `@source` fail with a successful build
and no error, which is why the file says so at the top rather than leaving it to be found.

**`components.json` still names `app.css` under `tailwind.css`, and that is deliberate for now.**
The shadcn CLI resolves the theme from the file named there, and only `app.css` assembles a whole
one: `tokens.css` imports no Tailwind, so pointing the CLI at it would resolve nothing. The cost
is that a registry item carrying `cssVars` writes tokens back into the window's file. Nothing has
done that yet; where to point it once the package owns `components.json` is #783's.
Variants go through `tailwind-variants`, and class merging through the shared helper.

**The shell's breakpoint is `shell:`, and it is declared once.** The sidebar family and the
window chrome gate on that variant, never on Tailwind's generic `sm:`/`md:` — those name a size,
where `shell:` names the decision that the navigation changes presentation. Script reads the same
declaration rather than restating the number.
Recorded originally as ADR 0022; what
binds a change is that **a bare `md:` appearing in the sidebar family or the shell is the signal
the decision was worked around** — it compiles, it renders, and it re-creates the drift where the
navigation and the styling disagree about where the breakpoint is.

**Width is not input modality.** An affordance that exists for fingers — an enlarged hit area, a
control revealed without hover — is never gated on how wide the window is. This application has
no touch input, and a window is narrow because somebody dragged it there with a mouse.

**Spacing comes from a subset of the scale, never the whole of it.** Tailwind's scale is linear,
so adjacent steps at the small end differ by a few percent, and a surface assembled from all of
them has no rhythm — a gap cannot say *these belong together* if the next gap up is barely wider.
The steps in use:

| Step | `1` | `1.5` | `2` | `3` | `4` | `6` | `8` | `12` | `16` |
| ---- | --- | ----- | --- | --- | --- | --- | --- | ---- | ---- |
| px   | 4   | 6     | 8   | 12  | 16  | 24  | 32  | 48   | 64   |

No two adjacent steps are closer than a third apart, which is what makes a difference in spacing
read as a difference in grouping. It binds `p-*`, `m-*`, `gap-*` and `space-*` on anything
composed here; a **size** — `size-4`, `h-8`, `max-w-*` — is a component's own dimension and is
not on this ladder, and `design/primitive/` keeps the geometry it was ported with
(ADR 0007).

**Review enforces this, and no spacing token is added to the stylesheet for it.** A semantic
scale beside the framework's own would make every component read in a dialect, and the token
layer is deliberately kept to what is genuinely global.

## Motion

**A surface built here carries motion, and the motion always responds to something** — an
interaction (hover, press, focus, scrolling to it) or a trigger (data arrives, state changes).
Nothing starts by itself and nothing loops. Recorded originally as ADR 0016; this is the part that binds a change.

**No motion library.** Reach for what is installed, choosing by what causes the motion:

| Cause | Mechanism |
| ----------------------------------- | ------------------------------------------------ |
| hover, press, focus                 | Tailwind `transition-*`                          |
| an element arriving on mount        | `tw-animate-css` (`animate-in`), as the primitives do |
| an element leaving on a data change | Svelte `out:` — CSS cannot, the node is gone first |
| an element moving position          | **unavailable** — see the ADR                    |

Prefer a transition defined through `css` over one through `tick`: the first runs off the main
thread, the second does not.

**Reduced motion is not automatic in either mechanism, so a surface that omits it is
unfinished.** Tailwind's `motion-safe:` gates CSS motion; `prefersReducedMotion` from
`svelte/motion` gates anything JavaScript-driven.

The token layer carries the two cases a surface cannot reach for itself: every CSS transition,
and the keyframe animation on anything bits-ui marks with `data-state` or `data-motion`. A
keyframe animation on an element carrying neither is still the surface's own to gate — which
covers anything composed here, and the looping indicators, left running deliberately.

**Motion is bidirectional, like everything else here.** A transform that assumes LTR breaks in
Arabic — prefer logical properties, and check both directions rather than one.

## Rendering

Everything is client-side. There is no SSR anywhere, and the build is static with an
`index.html` fallback. A page that assumes a server has misunderstood the architecture.

## i18n

`typesafe-i18n`, with English and Arabic. Arabic is RTL and is not a second-class locale —
a layout that only works LTR is broken.

**A machine's string carries `dir="ltr"` in both locales; a reader's string never does.** An
email address, a phone number, a file path, a keyboard shortcut, a version and a progress
figure are written by something other than the reader and read left to right wherever they
appear — the bidi algorithm reorders them inside an RTL paragraph and produces a value that
is wrong rather than merely misaligned. Set the attribute on the element that holds the value
and no wider.

**The trap is the stand-in.** Where a figure has a fallback — *unknown*, *checking* — the
fallback is the reader's word and takes the reader's direction, so the attribute is
conditional on there being a figure rather than fixed on the element.
`settings/component/updates.svelte` is the worked example: its plate takes an `isFigure`
parameter and sets `dir={isFigure ? 'ltr' : undefined}`.

*Why this is written down: it was applied consistently and recorded nowhere, so the only way
to learn it was to notice it, and a surface that missed it failed in Arabic alone.*

The type definitions and utility files are **generated**. Edit the locale files, then
regenerate — see [[references/pnpm]]. Components read translations from the store,
never from a locale module directly.

**A packaged component reads neither the store nor the locale metadata**, and this rule stops at
the package boundary. `@rentable/design` imports nothing that names this application, so its
words and its reading direction are supplied from outside: one typed object and one direction,
handed to `DesignProvider` once in `src/routes/+layout.svelte`. `@rentable/design/strings.js` is
the contract, and it holds what enforces it and why the direction travels with the words.

*Everything above is unchanged for a component that lives in this application, which is still all
but one primitive family and every block.*
