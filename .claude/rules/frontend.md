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

Components never call the API directly. A domain's `hooks/` wraps it in TanStack Query,
and components use those hooks. Query v6 takes a thunk, not an object.

Each domain's query module exports its key set, and mutations invalidate through those
keys. An invalidation that spells a key out inline drifts the moment the key changes.

Toast behaviour on a mutation goes through the shared success and error handlers, never
through direct toast calls in a component — that is what keeps `BAD_REQUEST` messages
reaching the user and everything else reading as an unexpected failure.

## Components

- **`fragments/` is generated.** It holds shadcn-svelte primitives; regenerate through the
  CLI rather than hand-editing. App-level composites go in `blocks/`.
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
