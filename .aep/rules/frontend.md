---
paths:
  - apps/desktop/src/lib/**
  - apps/desktop/src/routes/**
  - apps/desktop/src/app.css
  - packages/design/src/**
  - packages/design/components.json
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
through direct toast calls in a component — that is what keeps a refusal reaching the user
as the sentence its code stands for, in their language (`error/refusal.ts`, and
[[rules/api-layer]] under *Errors*), and everything else reading as an unexpected failure.

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

  **`components.json` lives in the package now**, at `packages/design/components.json`, with `ui`
  mapped to `#lib/primitive`. #783 moved it and proved it rather than assuming it: the one
  registry family the package did not already have was added through the CLI, landed under
  `packages/design/src/lib/primitive/`, passed `pnpm check` once formatted, and was removed again
  in the same branch. So the guard here is *do not replace*, and that is the only one — `add` on a family
  that is not present writes into the package, which is what it is for.
  *Between #780 and #783 it was also "do not add": the alias named a directory this application
  had deleted, so `add` would have re-created the tree from nothing, outside the package and
  reachable by no import.*
- **App-level composites go in a `block/`**, never in a `primitive/`. App-level means shared
  by concepts; the application shell's own components are not, and live in `layout` (#257).
  **Which `block/` is decided by what the composite reaches**, and #781 sorted the fifteen that
  existed: `packages/design/src/lib/block/` holds the eleven that reach nothing but the design
  system and what the package is already allowed (`$app/*`, which `back` navigates
  with), and `design/block/` here holds the ones that reach past it (four then, five since
  `language-choice.svelte`, below). A new composite that
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
  `utils`, `ui` and `hooks` each route a different kind of generated file, so they are not
  interchangeable and cannot be merged into one — which is why a `utils` key survives here
  against the naming rule. Repoint every one of them when a directory moves. With `lib` they
  read `#lib/block`, `#lib/tailwind`, `#lib/primitive`, `#lib` and `#lib`.
  **All five are stated, and each for its own reason.** `ui` and `hooks` default to
  `$lib/components/ui` and `$lib/hooks`, so omitting them makes the next generated primitive
  recreate the plural `components/` tree this layout removed. **`lib` routes nothing**: the one
  `registry:lib` item the registry has is `utils`, and the CLI resolves that through the `utils`
  key before it consults `lib`. It is stated because the CLI validates it anyway, defaulting it
  to `$lib`, which inside the package names nothing: the package declares no SvelteKit alias and its
  `tsconfig.json` maps `#lib/*` alone, so the CLI refuses its own default before it fetches
  anything — `Config Error: Invalid import alias found: ("lib": "$lib") in components.json.`
  *This rule said `lib` was the one key safely omitted, because `$lib` was genuinely its default.
  That was true while the file lived in `apps/desktop/`; #783 pointed the CLI at the package and
  got the error.*
- **`utils` is `#lib/tailwind`, and it carries no extension because it no longer needs one.**
  Read from the 1.5.0 bundle at #778: the CLI writes a `utils` registry item to the alias verbatim
  where it already ends `.ts` or `.js`, and appends `.ts` where it does not. Appending lands on
  `src/lib/tailwind.ts`, which is the owned module, where the documented `--overwrite` default
  applies and `git status` shows any write. *This read `@rentable/design/tailwind.ts` until #783,
  and there the extension was load-bearing: a package specifier ending `.js` named a path no file
  occupied, so a stock `cn` would have landed beside the owned module and won resolution for every
  one of the several hundred sites that name it, silently. The alias is internal now, and it is no
  longer the one the CLI's own refusal text calls off-contract.*
- **Domain UI lives with its domain**, not in the shared component tree.

## Styling

Tailwind v4, configured CSS-first — there is no JS config file to edit. **The configuration is
in two files and the split is by owner.** `packages/design/src/lib/tokens.css` is **the token
layer**: what the product's surfaces are drawn from, and the name used for it throughout this
rule. It holds the palette, the tone colours, shape and elevation, the shell breakpoint, and the
global rules any Rentable client wants.

**There are two appearances, light and dark, and every colour token has a value in each**: light
on `:root`, dark under `.dark`. On screen the class on `<html>` is the only thing that chooses,
and the application sets it (`apps/desktop/src/lib/platform/appearance.ts`), following the system
live unless the reader chose light or dark in general settings, and before the window is first
shown.
**Paper is always light**: the dark block applies under `@media screen` alone, and the print rules
in `apps/desktop/src/app.css` pin the light scheme, so a page printed from a dark window is not
printed dark (effort 835). **`.paper` is the one exception to the class choosing on screen**: the
token layer declares the light values on it as on `:root`, so a page previewed in a dark window is
drawn light, as it will print, and it takes the leading of its own language rather than the
window's.
A surface never chooses: there is no `dark:` variant in use, and a utility names a token, which
already differs by appearance. `packages/design/src/lib/tests/tokens.test.ts` refuses a token
declared in one block and not the other, and any text or tone under WCAG AA (4.5:1) against the
background, card or popover in either, and a disabled button's label under 3:1 on its muted fill
or on those surfaces. A disabled button is dimmed by that colour pair, never by opacity. A tone
darkened for light is the same token, saying the same thing. `apps/desktop/src/app.css` imports
it, registers the package with `@source`, and holds only what belongs to this window.

**The token layer's own header states the consumer contract**, and it is three lines rather than
two: `@import 'tailwindcss'` has to precede the package import, or `@theme`, `@layer base` and
`@apply` resolve against nothing. Both that and a missing `@source` fail with a successful build
and no error, which is why the file says so at the top rather than leaving it to be found.

**`components.json` names `tokens.css` under `tailwind.css`**, settled at #783 on ownership: a
registry item carrying `cssVars` or `@theme` is written into the file named there, and the only
right home for a token is the token layer. While the file lived in `apps/desktop/` it named
`app.css`, and leaving it there would have written packaged tokens into the window's own file —
re-splitting the layer across two files with no error.

**What pointing it there exposes, and why nothing reaches it.** The CLI does not read a theme out
of that file, it writes into it, and it inserts only where the stylesheet already carries an
`@import` or a `@theme` at-rule. `tokens.css` carries two, so a registry item's `cssVars` would
land — and a `cssVars.dark` block brings `@custom-variant dark` and a `.dark {}` rule with it,
into the one file that already holds the dark appearance's own `.dark` block, where a second one
would override it silently. **No `add` reaches it.** All 56
`registry:ui` items were read at #783 and not one carries `cssVars`; the theme lives in the
`registry:style` `init` item, and `init` is not run here. That is what makes this safe, rather
than the file being out of reach.
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

**Both locales render in Readex Pro**, one variable family drawn for Latin and Arabic together,
chosen by prototype in effort 832. The files are committed under
`packages/design/src/lib/font/` with their licence, `@font-face` in the token layer loads them
with `font-display: block`, and `--font-sans` names it first and `system-ui` after it. Nothing is
fetched from a network, and no fontsource package stands in for the files. `font/README.md` has
the source and the command that rebuilds them. **Nothing under `font/` is the package's
interface**: `exports` maps `./font/*` to `null`, so the README, the licence and `patch-tnum.py`
cannot be imported by a consumer, while the token layer still reaches the two files by relative
`url()`, which resolves on disk and never through the export map.

**Every text size and weight comes from one scale**, and it is Tailwind's own steps, a subset
of them:

| Size        | px | For                                                                  |
| ----------- | -- | -------------------------------------------------------------------- |
| `text-xs`   | 12 | metadata, field and menu labels, eyebrows, counts on a row, shortcuts |
| `text-sm`   | 14 | the body: list rows, controls, descriptions, menus                   |
| `text-base` | 16 | what is typed into an input, a card's title                          |
| `text-lg`   | 18 | a dialog, sheet or standalone surface's title                        |
| `text-xl`   | 20 | a figure the dashboard leads with                                    |
| `text-2xl`  | 24 | a record's title, on a narrow window                                 |
| `text-3xl`  | 30 | a record's or an area's title, and the link code                     |

| Weight          | For                                           |
| --------------- | --------------------------------------------- |
| `font-normal`   | running text, where a primitive resets it     |
| `font-medium`   | emphasis inside a line, a row's primary value |
| `font-semibold` | titles, labels, and the one figure a surface leads with |

No arbitrary size (`text-[...]`) and no other weight. A node test in each package fails on
`text-[`: `packages/design/src/lib/tests/typography.test.ts` and
`apps/desktop/src/lib/design/tests/typography.test.ts`. A size that seems to be missing is a
question about the scale, and the answer changes this table rather than one class.

**Money, counts and any figure compared down a column carry `tabular-nums`.** The cells in
`design/cell/` already do, and a component test holds them to it. *Readex Pro ships no `tnum`
feature, so the bundled Latin file is patched to carry one; `font/README.md` has how, and a node
test fails if the feature goes missing.*

**No letter spacing on a reader's text.** `tracking-*` pulls Arabic letters apart where they are
meant to join, and an uppercase English eyebrow does not need it enough to have a rule that
holds in one locale only. The same two tests fail on `tracking-` outside an allowlist of machine
strings, which are held `ltr` and never render Arabic: the link code and the keyboard shortcuts.

**Arabic gets its own line height**, 1.8 across the whole scale, set in the token layer on
`:root:lang(ar)`. Arabic ink reaches half an em below the baseline, and at the scale's English
line heights a line that truncates cuts it off. The token layer holds the measurement.

**Every icon is lucide (`@lucide/svelte`), at lucide's own stroke, and sized from three steps.**
A glyph is matched to the text beside it, so the step is read off the text rather than chosen,
and a glyph with no text beside it takes the step of the role it plays:

| Step       | Where                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------ |
| `size-3.5` | beside `text-xs`, the title bar's window controls, and a state trailing a label (a check)  |
| `size-4`   | the default: beside `text-sm`, in a button, a menu row, a cell, a status                   |
| `size-5`   | the mark in its tile, and a glyph that heads a block: the summary leading a dialog's panel |

A glyph inside a `primitive/` keeps the size it was ported with, for the reason spacing does
(ADR 0007): a radio row's dot and a resize grip are the primitive's geometry, not a size chosen
here. **A concept keeps one glyph everywhere it appears**: plus creates, `x` closes or clears,
`chevron-down` opens, `search` searches, and `square-pen` edits, renaming included. Lucide draws
outlines only, so the one solid mark, a disc, is `design/cell/disc.svelte`: the circle with its
fill on.

**A menu's rows carry icons on every row or on none.** A row leads with its glyph; a check or a
direction trailing the label is a state and is not the row's icon; a radio or checkbox row counts
as carrying one, because the primitive reserves the indicator's column at its start.
`design/tests/menu-icons.svelte.test.ts` holds the shared menus to it, and the record card's test
in the package holds both of its routes.

**Every corner is a step of one radius ladder**, Tailwind's own steps and values, declared in the
token layer with the stock set cleared, so a step not listed here builds nothing:

| Step          | px | For                                                                                                 |
| ------------- | -- | --------------------------------------------------------------------------------------------------- |
| `rounded-xs`  | 2  | a mark: a chart swatch, a tooltip's arrow, a resize grip; the menubar's ported rows                 |
| `rounded-sm`  | 4  | a small box: a checkbox, an item's media, a navigation link                                         |
| `rounded-md`  | 6  | a control the registry shipped and nothing here restyled: calendar cells, textarea                  |
| `rounded-lg`  | 8  | a label floating inside a surface: a field's error, a chart tooltip, a key, an input group's button |
| `rounded-xl`  | 12 | a row: a menu, command, select or sidebar row, a tab, a tile on the dashboard                       |
| `rounded-2xl` | 16 | a control or a card: a button, an input, a select trigger, a record card, a menu                    |
| `rounded-3xl` | 24 | a panel: a dialog, a sheet, a popover, the command menu, the list's frame                           |

Anything round all the way, a pill, a dot or a switch, is `rounded-full`, which is not a step.
An element laid exactly over its parent, a record card's link or a scroll viewport, takes
`rounded-inherit` so its corners follow whichever step the parent has.

**Elevation is two heights and one inset, each with a value per appearance**, since a shadow
tuned for a pale ground vanishes on a dark one. They are declared in both appearance blocks and
read by the utility, so a surface names the height and the appearance chooses the value:

| Utility               | For                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `shadow-raised`       | a card resting on the page, the sidebar's inset, the slider's thumb, the way past a screen                                              |
| `shadow-overlay`      | what floats over the page: a dialog, sheet, menu or popover, a chart's tooltip, a field's error, a record card lifted under the pointer |
| `inset-shadow-sunken` | a form's control cut into its panel (`insetControl`)                                                                                    |

A control sits flat on its surface and takes none. Tailwind's stock shadows are cleared, so
`shadow-lg` and the rest build nothing, and `cn` is taught the named ones, so a later height or
step replaces an earlier one. A node test in each package fails on an arbitrary radius or shadow
(`rounded-[`, `shadow-[`): `packages/design/src/lib/tests/shape.test.ts`, which also holds the
ladder and both appearances' values, and `apps/desktop/src/lib/design/tests/shape.test.ts`. A
step that seems to be missing is a question about the ladder, and the answer changes this table.

## Motion

**A surface built here carries motion, and the motion always responds to something** — an
interaction (hover, press, focus, scrolling to it) or a trigger (data arrives, state changes).
Nothing starts by itself and nothing loops. Recorded originally as ADR 0016; this is the part that binds a change.

**Motion answers cause and effect.** A record created arrives, a record deleted leaves, an undone
delete comes back in place, a reordered set moves, a pane swap carries its direction. Motion that
explains nothing is not added.

**Every duration and easing is a named token**, declared in `@rentable/design`'s `tokens.css`
and nowhere else. A surface names one of each and never writes a number:

| Token | Utility | Value | For |
| ----- | ------- | ----- | --- |
| `--ease-enter` | `ease-enter` | decelerate, `cubic-bezier(0, 0, 0.2, 1)` | something arriving |
| `--ease-exit` | `ease-exit` | accelerate, `cubic-bezier(0.4, 0, 1, 1)` | something leaving |
| `--ease-move` | `ease-move` | standard, `cubic-bezier(0.2, 0, 0, 1)` | something on screen changing place or size |
| `--duration-quick` | `duration-quick` | 150ms | a colour, a small control |
| `--duration-base` | `duration-base` | 200ms | a dialog, a menu, a row |
| `--duration-slow` | `duration-slow` | 250ms | a panel crossing the window |

Tailwind's stock easings are cleared, so `ease-in` and its siblings build nothing, and a bare
`transition-*` falls back on `duration-quick` and `ease-move`. `duration-*` and `ease-*` also set
the variables `tw-animate-css` reads, so one pair drives a transition and an `animate-in` alike.
In CSS, name the token: `var(--duration-base)`. Where a mechanism takes a number rather than a
class (Svelte's `in:`, `out:`, `animate:` and `svelte/motion`), the number is read from the token
rather than restated. A `motion.test.ts` in each package fails on a raw duration or easing in
that package's tree, `apps/desktop/src/lib/design/tests/` for the application and
`packages/design/src/lib/tests/` for the package, and neither reaches across.

**Nothing animates on a path used many times a day from the keyboard**: moving through a list
with the arrow keys, and the command palette. Both answer at once. The dialog primitive's
`motion={false}` is how the palette opts out, because class merging cannot take an animation back
off.

**No motion library.** Reach for what is installed, choosing by what causes the motion:

| Cause | Mechanism |
| ----------------------------------- | ------------------------------------------------ |
| hover, press                        | Tailwind `transition-*`                          |
| an element arriving or leaving that bits-ui drives (dialog, sheet, menu) | `tw-animate-css` (`animate-in`, `animate-out`), as the primitives do |
| an element leaving on a data change | Svelte `out:` — CSS cannot, the node is gone first |
| a value changing (a count, a ring filling) | `svelte/motion` (`Tween`, `Spring`)     |
| an element moving position among siblings on screen | `svelte/animate` (`animate:flip`) |
| a record created, deleted, restored or re-sorted in a directory; a pane swap | a same-document view transition (`document.startViewTransition`) |

**A view transition is feature-detected, and its fallback is no animation.** Where
`startViewTransition` is missing (macOS below 15, an old WebKitGTK) the change is committed
directly and simply appears. Only a change caused by a mutation, an undo or a sort transitions; a
search keystroke does not. `animate:flip` moves only rows already on screen, which is why a
virtualised directory uses a view transition rather than it.

Prefer a transition defined through `css` over one through `tick`: the first runs off the main
thread, the second does not.

**Reduced motion is not automatic in either mechanism, so a surface that omits it is
unfinished.** Tailwind's `motion-safe:` gates CSS motion; `prefersReducedMotion` from
`svelte/motion` gates anything JavaScript-driven.

The token layer carries the three cases a surface cannot reach for itself: every CSS transition,
the keyframe animation on anything bits-ui marks with `data-state` or `data-motion`, and every
`::view-transition-*` pseudo-element. A keyframe animation on an element carrying none of those is
still the surface's own to gate, and so is a transform a pointer applies, such as a hover lift:
collapsing its transition makes it jump rather than stop. That covers anything composed here, and
the looping indicators (spinner, skeleton, caret), left running deliberately.

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

**A reader's own words, a name, an address, a location, are isolated where they render**, in a
`<bdi>` inside the box that styles them. A Latin value in an Arabic line is otherwise reordered at
its edges: "Adeline Wiegand Sr." reads ".Adeline Wiegand Sr" and "4253 Russel Motorway" reads
"Russel Motorway 4253". The isolate is inline rather than `dir="auto"` on the box, because `dir`
also picks the edge the box aligns to. `design/cell/text.svelte` is the cell a row draws one with;
the record surface's title and eyebrow and a specification's text values isolate themselves.

**The locale files are written in lower case, and a product's name keeps its capital.** A heading
is raised to sentence case where it renders (`first-letter:uppercase`, or `toTitleCase` for a
title); a description, the line under a heading or a field, reads as written, in lower case, on
every surface, because raising only its first letter would leave its second sentence lower case
beside it. *Turso* is a product's name and is written *Turso* in both locales, wherever it falls
in the sentence. `i18n/tests/casing.test.ts` holds both.

**One exception: a message written to someone.** The WhatsApp reminder (`contracts.reminder`) is a
letter the tenant reads in their own chat, not a label on the application's screen, so it is
written as a letter is, opening with a capital and ending with a full stop (effort 835).

**Figures use Western digits in both locales.** Money, counts, dates and relative times read
`1,500`, not `١٬٥٠٠`, in Arabic as in English. `getIntlLocale` in `platform/locale.ts` is where
that is decided: it maps `ar` to `ar-SA-u-nu-latn`, and every `Intl` and `DateFormatter`
construction goes through it, the calendar primitive included, which is handed the reader's
locale rather than left on its `en-US` default. A search typed in Arabic-Indic digits still
matches, because search folds them. *This is the human's decision of 2026-09-24, and it reverses
effort 810, which formatted Arabic in Arabic-Indic digits.*

**What mirrors in Arabic is this list, and nothing else.** A glyph or control mirrors when what it
shows is a direction along the line of text:

- **back and next**: `arrow-left` and `arrow-right` on a back or a forward control;
- **sequence chevrons**: `chevron-left`/`-right` and `chevrons-left`/`-right` on pagination, a
  calendar's months, a carousel, a sub-menu, and the breadcrumb's separator;
- **progress**: a bar fills from the start edge, which is why `primitive/progress` sets a width
  rather than a translate;
- **sliders**: the slider's range fills from the start edge, which is why `primitive/slider`
  hands bits-ui `contract.direction`.

A clock, a check, the search glass, the mark (the logo) and a slash never mirror, and neither does
anything else that is a thing rather than a direction. The `ring` cell is a clock face, so its arc
starts at twelve and runs clockwise in both locales. A glyph turns round with `rtl:rotate-180`
where it is symmetric top to bottom, as every arrow and chevron is, and `rtl:-scale-x-100`
otherwise; a primitive may carry the class on the control around the glyph. A glyph that
already points both ways, such as the list's transfer arrows, is on no list and carries neither.
`design/tests/icons.test.ts` holds the tree to both halves of it.

The type definitions and utility files are **generated**. Edit the locale files, then
regenerate — see [[references/pnpm]]. Components read translations from the store,
never from a locale module directly.

**One exception: text handed to a tenant in the language chosen for it.** The printed schedule, the
receipt, the name a saved one is offered under, and the WhatsApp reminder are written in the
language picked in their preview, which need not be the one the application shows, so they read it
through `i18nObject(locale)`, which startup has already loaded, and a page sets that language's
`lang` and `dir` on itself. Everything drawn for the reader of the screen still reads the store
(effort 835).

**A packaged component reads neither the store nor the locale metadata**, and this rule stops at
the package boundary. `@rentable/design` imports nothing that names this application, so its
words and its reading direction are supplied from outside: one typed object and one direction,
handed to `DesignProvider` once in `src/routes/+layout.svelte`. `@rentable/design/strings.js` is
the contract, and it holds what enforces it and why the direction travels with the words.

*Everything above is unchanged for a component that lives in this application, and that is every
cell, every component under a concept or under `layout`, and the five blocks under `design/block/`:
`list.svelte`, the three that effort 832 added around it, `create-control.svelte`,
`list-toolbar.svelte` and `search-field.svelte`, and `language-choice.svelte`, which effort 835
added for the language a printed page or a reminder is written in and which reads this
application's own list of languages (`localesMetadata`). **They stay because each reads a module of this
application, not a contract the package could be handed.** `create-control` reads the create key
(`design/create-key.ts`) and registers with what answers it (`design/create-target.svelte.ts`),
which is what makes it the one control [[rules/interface]] *Create* says draws a create and the one
the key finds. `search-field` registers the list's search shortcut (`design/list-keyboard.ts`) in
this application's shortcut registry, which reaches `$lib/platform` to record a collision, and
`list-toolbar` draws `search-field`, so both are on the application's side of the reach test under
*Components* above. `$lib` names nothing inside the package, so none of the three could move without
the create key, its targets and the list's keyboard moving with it. (`block/record-actions.svelte`
stayed too, until effort 832 made copy details a record act and retired it.) What #780, #781 and
#782 finished is the primitive tree and thirteen of the fifteen blocks they started from, not the
crossing, and the rule below is most of why the rest stay.*

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

**A path a packaged component navigates to is the caller's to resolve, and the gate does not
check it.** `svelte/no-navigation-without-resolve` does run on `packages/design/src/**` — that was
measured on 2026-08-27 and `[[references/eslint]]` has the probe — but the half of it that reads
types cannot work there. It accepts any value typed `ResolvedPathname`, and `ResolvedPathname`
degrades to `string` in a package that generates no route types, so every `href` and every `goto`
argument a packaged component is *handed* passes. Only a literal written in the package itself is
still caught.

**Nothing can close that from inside the package**: narrowing the type would mean naming a
consumer's routes in the library written not to know them. So it is an obligation on the two sides
instead. **The consumer hands in a path it has already resolved**, which is what
`record-card`, `record-surface`, `section-switch` and `back` each say in a comment at the point they use one. **The
packaged component says in its prop's own documentation that it expects a resolved path**, because
that docstring is the only thing a second consumer will read before supplying one.

**A parameterised string is the contract's only where the package owns the number.**
`DesignStrings` is 37 keys and 35 of them are plain strings; `moreRecords` is a function because
`block/selection-dialog` counts the refused records it had no room to name, from a plan its
consumer handed in, so there is no moment at which the consumer could have resolved the phrase.
`refusal` is the second function: a confirmation turns the refusal its act earned into the
reader's words, and only the consumer holds the refusal sentences (`error/refusal.ts`).
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

**This rule decides where a component lives, not only how it is written**, and #782 is where that
turned out to matter. `block/list.svelte` registers three shortcuts, each naming a key under
`common.table`, and no amount of inverting its other couplings would have made those
registrations legal in the package. So the block stays with this application, and
`design/list-keyboard.ts` and `design/shortcut-registry.{ts,svelte.ts}` stay with it: the first
builds the registrations and the second two hold them. *Since effort 832 the search key is
registered by `design/block/search-field.svelte` (`toSearchShortcut`) and the other two by the
list (`toListShortcuts`), so the field stays with this application for the same reason, and every
set that draws it answers `/`.* **Nothing in the package holds a registry or wants one**:
`shortcut.ts` says so in its own header, and every other caller is under `layout/` or
`design/block/`. Read the placement rule as the rule's consequence rather than as a second rule; the
effort's spec carries the full argument under `# Open Questions`.
