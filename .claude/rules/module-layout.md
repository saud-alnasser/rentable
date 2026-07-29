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

## The tree still diverges, and that is expected

The current tree violates every row above in places — `src/lib/api/mod.ts` is the standing
example. Each divergence has a ticket under the refactor programme, whose rule is in
`CLAUDE.md` and governs here unchanged: **do not add a new violation, and do not fix an old
one opportunistically.**

What that rule means specifically for naming: an unrelated rename folded into a change makes
the change unreviewable, and it takes the work off the ticket that was scoped for it.
