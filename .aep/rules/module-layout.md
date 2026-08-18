---
aep: 2.5.1
owner: repository
date: 2026-08-18
kind: rule
mode: [prototype]
paths:
  - apps/desktop/src/**
  - apps/desktop/tauri/src/**
  - apps/control-plane/src/**
use-when: "adding a module, a file, or a directory under src/ or tauri/src/, including throwaway prototype code"
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when source under `apps/desktop/src/` or
  `apps/desktop/tauri/src/` is read, and costs nothing otherwise.

  *Prototyping* was merged in here on 2026-08-17, from its own file. It answers
  the same question this rule answers — where a file goes — for the one kind of
  file that is not meant to survive, and it carries the `mode: [prototype]` that
  file declared. Nothing was dropped or reworded; cite it as
  `[[rules/module-layout]], under *Prototype code*`.
-->

# Module layout and naming

One concept per file. Prefer a directory over a verbose filename. Prefer concise,
descriptive names over abbreviations.

**`apps/control-plane/src/` joined the paths above on 2026-08-18 with #549, and only the
table below has a subject there.** It is flat — no concept in it has children yet — and the
sections on Rust and on prototype code cover nothing in that package. The forbidden names are
the part worth carrying: a second package with no naming rule is precisely where a `utils.ts`
appears.

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

## A Rust directory is rooted by `mod.rs`

A module with children is a `<concept>/` directory whose root is `mod.rs` — `sync/mod.rs`,
`sync/google/mod.rs`, `backup/mod.rs`. Never `<concept>.rs` beside `<concept>/`.

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
