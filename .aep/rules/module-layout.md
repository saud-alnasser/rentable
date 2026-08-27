---
paths:
  - apps/desktop/src/**
  - apps/desktop/tauri/src/**
  - apps/control-plane/src/**
  - packages/design/src/**
use-when: "adding a module, a file, or a directory under src/ or tauri/src/, including throwaway prototype code"
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when source under any of the four trees listed
  there is read, and costs nothing otherwise.

  *Prototyping* was merged in here on 2026-08-17, from its own file. It answers
  the same question this rule answers — where a file goes — for the one kind of
  file that is not meant to survive, and it carries the `mode: [prototype]` that
  file declared. Nothing was dropped or reworded; cite it as
  `[[rules/module-layout]], under *Prototype code*`.
-->

# Module layout and naming

One concept per file. Prefer a directory over a verbose filename. Prefer concise,
descriptive names over abbreviations.

**`apps/control-plane/src/` joined the paths above on 2026-08-18 with #549**, and the sections
on Rust and on prototype code cover nothing in it. Everything else does.
It was flat for two
tickets and is grouped by concept since #560 — `account/`, `database/`, `server/`, `session/`,
`workspace/`, with the entrypoint and the refusal vocabulary left at the root because they belong
to no one concept. *`session/` arrived with #550, which is what made the three-day window a
credential the control plane issues rather than a flag a client sets.*

**`packages/design/src/` joined on 2026-08-23 with #777**, with the same carve-out: it is a
Svelte library, so the Rust sections have no subject there either. It is `src/lib/` plus
`src/tests/`, and which of the two a file goes in is [[rules/testing]]'s answer rather than
this rule's.

**`apps/desktop/src/tests/` arrived on 2026-08-27 with #811**, and it is that same second
directory rather than a new idea: the application got a component runner of its own, and a runner
needs a setup file that is scaffolding rather than a test. It holds what belongs to the runner.
**A test still goes in a `tests/` directory under the thing it covers** — `src/lib/design/cell/
tests/` for a cell, `src/lib/layout/tests/` for a layout component — and that is unchanged.
[[rules/testing]] is the answer for which of the two, here as in the package.

A module name states a concept, so these names are not available:

| Avoid                  | Use instead                          | Why                                           |
| ---------------------- | ------------------------------------ | --------------------------------------------- |
| `utils`                | the concept's own name               | a grab-bag name invites unrelated code        |
| `common`               | `design`, `platform`, or the concept | same                                          |
| `mod.ts`               | the concept's own name               | a Rust/Deno idiom, unclear in TypeScript      |
| plural directory names | the singular                         | a directory names a concept, not a collection |

A third-party tool's configuration keys are its API, not this repository's names — where a
generator's schema fixes a key this table forbids, the key stays and only the path it
points at is chosen here.

**`tests/` is the one plural directory name here, and it is a declared exception** rather than
a hole in the row above. It holds what covers a concept rather than part of the concept, so
"a directory names a concept" is not the question it answers; the singular reads as one test;
and Rust already spends `test/` on shared scaffolding, so the two would collide.
[[rules/testing]] defines it and this is the only place it is allowed. Settled 2026-08-18 with
#559.

## A Rust directory is rooted by `mod.rs`

A module with children is a `<concept>/` directory whose root is `mod.rs` — `sync/mod.rs`,
`sync/google/mod.rs`, `database/mod.rs`. Never `<concept>.rs` beside `<concept>/`.

The crate is on edition 2024, where both spellings compile, so this is a choice rather than a
constraint. It is made this way because the alternative writes the concept's name twice and
then makes the two drift: the file and the directory are one module, and a reader who opens
`sync.rs` has to know that half of it is somewhere else. One directory, one root, and the
name appears once — on the directory that holds everything the module is.

## A Rust name is one word

Files and directories under `tauri/src/` are named with a single word; where a qualifier is
needed, a directory carries it. `google/test/server.rs`, not `google/test_server.rs`.

This is the same rule as the table above, applied to the shape Rust makes easy: an
underscore is available in a filename, so a module that grows a second concern grows a
second word instead of a directory, and the tree stops describing itself.

## The tree conforms; keep it that way

Every row above now holds throughout `src/lib/` and `tauri/src/` (#126). The standing
counter-example used to be `src/lib/api/mod.ts`; there is no `mod.ts`, no `utils/`, no
`common/`, and no plural module directory left. `src/routes/` is the acknowledged
exception, and its segments are URL path names rather than module names.

Where a divergence turns up anyway, `CLAUDE.md`'s rule on architectural boundaries governs
what happens to it. What that means specifically for naming: **a rename the change is not
about waits for its own ticket**, however small it looks from here.

## Prototype code

### Throwaway prototype code goes in `src/lib/prototype/`

Beside `switcher.svelte`, the repository's own prototype machinery, driven by
`pnpm prototype`. Leave it untracked, and delete it once its question is answered — the
write-up under the effort's `evidence/prototypes/` is what survives.

*Why: being untracked, it shows in `git status`, which is what stops it being committed
silently.*

### It cannot live under a gitignored protocol directory

Vite serves nothing from outside the project's source tree, so importing a component from
`.aep/position/` — or anywhere else outside `src/` — fails at transform time:

```
Failed to load url .../position/prototypes/<name>.svelte ... Does the file exist?
```

*Why: the file exists and the error still says it does not, so the failure reads as a
missing file rather than as a path that was never servable.*

Established 2026-08-12 against Vite 8.2.0 / SvelteKit 2 / Svelte 5, when a prototype
written to the protocol directory could not be imported from a route.
