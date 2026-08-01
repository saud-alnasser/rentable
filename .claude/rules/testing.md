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

# Testing

## TypeScript

Tests are `*.test.mjs`, colocated with the code they cover, using `node:test` and
`node:assert/strict`, importing the `.ts` source directly. They run under `tsx`, which is
what resolves the `$lib` alias and the `.ts` imports.

Two levels are covered, and they are not interchangeable:

- **Pure logic** — the domain modules and helpers — is covered directly.
- **Router procedures** are covered end to end, through the real caller bound to an
  in-memory database. Not mocked: the in-memory client is type-identical to production, so
  the language boundary is exercised rather than stubbed.

Commands are in `.claude/tools/node-test.md`, including the single-file invocation.

## Rust

`#[cfg(test)]` modules — inline for a single-file module, or a `tests.rs` inside a module
tree. Rust tests run single-threaded; they touch the filesystem and are not isolated from
each other otherwise. See `.claude/tools/cargo.md`.

## Characterization tests

Some tests pin behaviour that is **known to be wrong** and are labelled as such in a
comment above them — the contract status model is the standing example. They exist so a
later correction shows up as an intended, visible change.

**Do not "fix" a pinned expectation** to match what the documentation says it should be.
Change the code and the test together, on the ticket that scoped it.
