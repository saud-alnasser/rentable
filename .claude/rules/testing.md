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

A `#[cfg(test)] mod tests` at the foot of the file it covers. Never a `tests.rs` gathering
the tests of a whole directory: a shared test module hides which file a failure belongs to,
and it survives the split of the module it was written against, so the tests of two
concerns end up in one place with nothing marking the seam.

The cost is paid knowingly. Fixtures used by more than one module are written out in each
of them rather than shared, and a fixture is cheap to duplicate where a subject is not — a
second copy of a builder is worth the file that names its own coverage.

A helper that is genuinely shared scaffolding rather than a fixture — the loopback Drive
server, say — is a module of its own under a `test/` directory, not a test module.

Rust tests run single-threaded; they touch the filesystem and are not isolated from each
other otherwise. See `.claude/tools/cargo.md`.

## Characterization tests

Some tests pin behaviour that is **known to be wrong** and are labelled as such in a
comment above them — the contract status model is the standing example. They exist so a
later correction shows up as an intended, visible change.

**Do not "fix" a pinned expectation** to match what the documentation says it should be.
Change the code and the test together, on the ticket that scoped it.
