---
aep: 2.5.1
owner: repository
date: 2026-08-18
kind: rule
paths:
  - apps/desktop/src/**
  - apps/desktop/tauri/src/**
  - apps/control-plane/src/**
use-when: "writing or changing a test, or deciding what a change must be tested at"
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when source under `apps/desktop/src/`,
  `apps/desktop/tauri/src/`, or `apps/control-plane/src/` is read, and costs
  nothing otherwise.

  The control plane was added to that list on 2026-08-18 with #549. **The
  TypeScript section applies to it word for word.** The Rust section has no
  subject there and the router level has none yet; when the control plane grows
  routes, they are covered end to end against a real database for the same
  reason the desktop's are.
-->

# Testing

## TypeScript

A test is `<name>.test.ts`, in a `tests/` directory under the directory it covers:
`src/lib/api/period.ts` is covered by `src/lib/api/tests/period.test.ts`. It uses `node:test`
and `node:assert/strict` and imports the `.ts` source directly. Tests run under `tsx`, which is
what resolves the `$lib` alias and the `.ts` imports.

*Why a directory rather than beside the module (#559, 2026-08-18): a concept's directory then
lists the concept, and what covers it is one listing instead of a filter over an interleaved
one.*

**Shared scaffolding sits in the same `tests/` directory and is not a test.**
`src/lib/api/tests/testing.ts` builds the caller a dozen router tests need; it carries no
`.test` in its name, which is what keeps the runner from collecting it.

Two levels are covered, and they are not interchangeable:

- **Pure logic** — the domain modules and helpers — is covered directly.
- **Router procedures** are covered end to end, through the real caller bound to an
  in-memory database. Not mocked: the in-memory client is type-identical to production, so
  the language boundary is exercised rather than stubbed.

**The desktop's tests are not type-checked, and the control plane's are.** `svelte-kit sync`
generates an `include` of `.js`, `.ts` and `.svelte` and never `.mjs`, so for as long as the
desktop's tests were `.test.mjs` not one of them was ever checked; renaming them surfaced 852
errors and `apps/desktop/tsconfig.json` excludes `src/**/tests/**` until #561 clears them.
**Write a new test as though it were checked** — annotations rather than `any` — because #561
is what decides whether it was, and a test written loose today is work for that ticket.

Commands are in [[references/node-test]], including the single-file invocation.

## Rust

A `#[cfg(test)] mod tests` **inside** the file it covers, at its foot. Never a `tests.rs`
gathering the tests of a whole directory: a shared test module hides which file a failure belongs to,
and it survives the split of the module it was written against, so the tests of two
concerns end up in one place with nothing marking the seam.

The cost is paid knowingly. Fixtures used by more than one module are written out in each
of them rather than shared, and a fixture is cheap to duplicate where a subject is not — a
second copy of a builder is worth the file that names its own coverage.

A helper that is genuinely shared scaffolding rather than a fixture — the loopback Drive
server, say — is a module of its own under a `test/` directory, not a test module.

**The asymmetry with TypeScript above is deliberate**, and was settled on 2026-08-18 when the
TypeScript half moved. Rust has a module system doing real work here: `mod tests` is a child of
the module it covers, `use super::*` reaches everything in it including what is private, and a
reader sees the coverage without leaving the file. TypeScript has none of that — a test there
imports a public surface from a separate module whichever directory it sits in — so the only
thing left for the choice to buy is how the tree reads, and a `tests/` directory reads better.

Rust tests run single-threaded; they touch the filesystem and are not isolated from each
other otherwise. See [[references/cargo]].

## Characterization tests

Some tests pin behaviour that is **known to be wrong** and are labelled as such in a
comment above them — the contract status model is the standing example. They exist so a
later correction shows up as an intended, visible change.

**Do not "fix" a pinned expectation** to match what the documentation says it should be.
Change the code and the test together, on the ticket that scoped it.
