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

- **The primitive tree was generated once and is owned now.** It holds shadcn-svelte
  primitives, and the two operations on it are not the same one: **a new primitive is added
  through the CLI; an existing primitive is changed by hand.** The generator writes whole
  files rather than merging, so the flags that make it replace one already here — `add
  --overwrite`, `init --reinstall` — discard whatever this repository put in it. Adding is
  safe; replacing is what there is no way back from. [[references/shadcn-svelte]] has both.
  What they would discard is load-bearing. Thirty-five of these files, across eighteen of the
  56 families, read the contract `@rentable/design/strings.js` declares — for a string, or for
  `dir` on the rendered element. A regenerated file carries neither and still compiles and
  renders, so the damage shows up as a silently English, silently LTR primitive rather than as
  an error. *This used to count files reading this application's i18n store, and it fell from
  eighteen families to seven across #777, #778 and #779. It reached zero at #780, when the last
  seven crossed. What replaced it is the count above, which is the same hazard against the
  contract instead of against the store. Read it as the shape rather than the figure; what makes
  it right is the argument, not the arithmetic.*

  **Every family has crossed, and that makes the CLI more dangerous rather than less.**
  `components.json` still maps `ui` to `$lib/design/primitive`, and repointing it is #783's.
  As of #780 that path is a directory this application no longer has, so `add` there does not
  overwrite anything — it creates the tree from nothing, outside the package, reachable by no
  import. The guard used to be *do not replace*; until #783 lands it is *do not add either*,
  because the reader who finds two spinners is told by nothing which of them the application
  draws.
- **App-level composites go in a `block/`**, never in a `primitive/`. App-level means shared
  by concepts; the application shell's own components are not, and live in `layout` (#257).
  **Which `block/` is decided by what the composite reaches**, and #781 sorted the fifteen that
  existed: `packages/design/src/lib/block/` holds the eleven that reach nothing but the design
  system and what the package is already allowed (`$app/*`, which `record-surface` navigates
  with), and `design/block/` here holds the four that reach past it. A new composite that
  reaches `$lib/api`, `$lib/platform`, `$lib/error` or a concept belongs in this application; one
  that reaches none of them belongs in the package, where a second client can draw it.

  **Read the whole reach, not the import list.** Two of the four that stayed import nothing from
  that list themselves: `export-dialog` reaches `$lib/platform` through `design/csv`, and
  `record-card` reaches both `$lib/platform` and `$lib/error` through the class list it borrows
  from `list.svelte`. A test applied to the first line of imports would have moved them both.
  **A type-only import is a reach.** `csv.ts` names `$lib/platform/tauri` for two types and
  nothing else, and the bar is not what survives the build but what resolves: `$lib` has no
  meaning inside the package, so `svelte-check` fails there on an erased import as readily as on
  a live one.

  **`$lib/i18n` is not on that list, and it is the reach most likely to be mistaken for one.**
  A `$LL` read is a cost rather than a bar, because the contract is what it inverts onto: #781
  moved five blocks that each had one. All four that stayed read `$LL` too, and not one of them
  stayed for that.
- **`components.json`'s alias keys are the CLI's vocabulary, not ours.** `components`,
  `utils`, `ui`, and `hooks` each route a different kind of generated file, so they are
  not interchangeable and cannot be merged into one — which is why a `utils` key survives
  here against the naming rule. Repoint every one of them when a directory moves.
  **State `ui` and `hooks` even though they are optional**: their defaults are
  `$lib/components/ui` and `$lib/hooks`, so omitting them makes the next generated
  primitive recreate the plural `components/` tree this layout removed. `lib` is the only
  one omitted, because `$lib` is genuinely its default.
- **`utils` names the packaged file with its `.ts` extension**, `@rentable/design/tailwind.ts`,
  and the extension is a guard rather than a formality. Read from the 1.5.0 bundle at #778: the
  CLI writes a `utils` registry item to the alias verbatim where it already ends `.ts` or `.js`,
  and appends `.ts` where it does not. Written `.js`, the target is a path no file occupies, so
  a stock `cn` would land beside the owned module and win resolution for every one of the several
  hundred sites that name it, silently. Written `.ts`, the target is the owned file, where the
  documented `--overwrite` default applies and `git status` shows any write. **It is the one
  alias here that is a package specifier rather than a `$lib` path**, which the CLI's own
  refusal text calls off-contract, and #783 is where that stops being true.
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
not on this ladder, and the packaged `primitive/` keeps the geometry it was ported with
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

*Everything above is unchanged for a component that lives in this application, and after #781 that
is every cell, every component under a concept or under `layout`, and the four blocks that have
not crossed. What #780 and #781 finished is the primitive tree and eleven of the fifteen blocks,
not the crossing.*

**A packaged component that needs a reading direction reads `contract.direction` and never
derives one.** #779 moved ten families whose only locale read was
`dir={localesMetadata[$locale].direction}`, and each became `dir={contract.direction}` on the
same element. A component that imports a locale and maps it to a direction itself has rebuilt
the coupling the package exists to remove, in a place no grep for `$lib/i18n` would find. #780
added the two families that read a direction for something other than the attribute — `sheet`
picks the edge it slides in from, `sidebar` picks the side its tooltips stand on — and both read
the same member. #781 added `block/form-surface`, whose panel is portalled to `document.body`
and so states a direction rather than inheriting one. A direction derived from anything else is
the same defect wearing a `$derived`.

**A parameterised string is the contract's only where the package owns the number.**
`DesignStrings` is 28 keys and 27 of them are plain strings; `moreRecords` is a function because
`block/selection-dialog` counts the refused records it had no room to name, from a plan its
consumer handed in, so there is no moment at which the consumer could have resolved the phrase.
Every other counted phrase on that surface arrives as a prop, `describeReason` and `summarize`
among them, because the words are the concept's. **Ask who knows the number**: the package, and
it is a key; the caller, and it is a prop.

**A packaged component registers no keyboard shortcut of its own.** A registration describes
itself out of `TranslationFunctions`, which is this application's generated type, so one
declared inside the package would be naming keys in a dictionary the package has no way to
reach. #780 found the only instance and is where the rule comes from: `SidebarState` registered
`sidebar.toggle` from its own constructor, and the registration moved to
`layout/component/sidebar.svelte` while the key it answers stayed with the primitive as
`SIDEBAR_KEYBOARD_SHORTCUT`. **A packaged component that wants a key states the key and lets its
consumer register it**, which keeps one place the key is written down and puts the description
where the dictionary is.
