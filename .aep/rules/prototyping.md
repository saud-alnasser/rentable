---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
mode: [prototype]
paths:
  - src/lib/prototype/**
use-when: "writing throwaway prototype code in this repository, or deciding where it goes"
---

# Rule — prototyping

## Throwaway prototype code goes in `src/lib/prototype/`

Beside `switcher.svelte`, the repository's own prototype machinery, driven by
`pnpm prototype`. Leave it untracked, and delete it once its question is answered — the
write-up under the effort's `evidence/prototypes/` is what survives.

*Why: being untracked, it shows in `git status`, which is what stops it being committed
silently.*

## It cannot live under a gitignored protocol directory

Vite serves nothing from outside the project's source tree, so importing a component from
`.aep/position/` — or anywhere else outside `src/` — fails at transform time:

```
Failed to load url .../position/prototypes/<name>.svelte ... Does the file exist?
```

*Why: the file exists and the error still says it does not, so the failure reads as a
missing file rather than as a path that was never servable.*

Established 2026-08-12 against Vite 8.2.0 / SvelteKit 2 / Svelte 5, when a prototype
written to the protocol directory could not be imported from a route.
