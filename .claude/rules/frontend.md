---
paths:
  - src/lib/**
  - src/routes/**
  - src/app.css
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
the key changes. Settings, backups, and remote-sync keep their own keys and invalidations.

Toast behaviour on a mutation goes through the shared success and error handlers, never
through direct toast calls in a component — that is what keeps `BAD_REQUEST` messages
reaching the user and everything else reading as an unexpected failure.

## Components

- **`design/primitive/` was generated once and is owned now.** It holds shadcn-svelte
  primitives, and the two operations on it are not the same one: **a new primitive is added
  through the CLI; an existing primitive is changed by hand.** The generator writes whole
  files rather than merging, so the flags that make it replace one already here — `add
  --overwrite`, `init --reinstall` — discard whatever this repository put in it. Adding is
  safe; replacing is what there is no way back from. `.claude/tools/shadcn-svelte.md` has both.
  What they would discard is load-bearing. More than thirty of these files, across eighteen
  primitive families, read the i18n store — for a translated string, or for `dir` on the
  rendered element. A regenerated file carries neither and still compiles and renders, so
  the damage shows up as a silently English, silently LTR primitive rather than as an
  error.
- **App-level composites go in `design/block/`**, never in `design/primitive/`.
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

Tailwind v4, configured CSS-first in `src/app.css` — there is no JS config file to edit.
Variants go through `tailwind-variants`, and class merging through the shared helper.

## Rendering

Everything is client-side. There is no SSR anywhere, and the build is static with an
`index.html` fallback. A page that assumes a server has misunderstood the architecture.

## i18n

`typesafe-i18n`, with English and Arabic. Arabic is RTL and is not a second-class locale —
a layout that only works LTR is broken.

The type definitions and utility files are **generated**. Edit the locale files, then
regenerate — see `.claude/tools/pnpm.md`. Components read translations from the store,
never from a locale module directly.
