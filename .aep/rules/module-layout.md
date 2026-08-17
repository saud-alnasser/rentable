---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/**
  - apps/desktop/tauri/src/**
use-when: "adding a module, a file, or a directory under src/ or tauri/src/"
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when source under `apps/desktop/src/` or
  `apps/desktop/tauri/src/` is read, and costs nothing otherwise.
-->

# Module layout and naming

One concept per file. Prefer a directory over a verbose filename. Prefer concise,
descriptive names over abbreviations.

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
