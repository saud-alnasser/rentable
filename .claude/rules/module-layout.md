---
paths:
  - src/**
  - tauri/src/**
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when source under `src/` or `tauri/src/` is read
  and costs nothing otherwise.
-->

# Module layout and naming

One concept per file. Prefer a directory over a verbose filename. Prefer concise,
descriptive names over abbreviations.

A module name states a concept, so these names are not available:

| Avoid                  | Use instead                      | Why                                           |
| ---------------------- | -------------------------------- | --------------------------------------------- |
| `utils`                | the concept's own name           | a grab-bag name invites unrelated code        |
| `common`               | `ui`, `platform`, or the concept | same                                          |
| `mod.ts`               | the concept's own name           | a Rust/Deno idiom, unclear in TypeScript      |
| plural directory names | the singular                     | a directory names a concept, not a collection |

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

## The tree still diverges, and that is expected

The current tree violates every row above in places — `src/lib/api/mod.ts` is the standing
example. Each divergence has a ticket under the refactor programme, whose rule is in
`CLAUDE.md` and governs here unchanged: **do not add a new violation, and do not fix an old
one opportunistically.**

What that rule means specifically for naming: an unrelated rename folded into a change makes
the change unreviewable, and it takes the work off the ticket that was scoped for it.
