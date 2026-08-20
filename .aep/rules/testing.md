---
aep: 2.7.0
owner: repository
date: 2026-08-20
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

**Every test here is type-checked, the desktop's included.** `svelte-kit sync` generates an
`include` of `.js`, `.ts` and `.svelte` and never `.mjs`, so for as long as the desktop's tests
were `.test.mjs` not one of them was ever checked; renaming them surfaced 852 errors, and #561
cleared them and took the exclusion back out of `apps/desktop/tsconfig.json` (2026-08-18).
**So write a new test as though the compiler reads it, because it does** — annotations rather
than `any`, and a fixture in the shape production actually produces.

**A fixture for a declared interface is shared, not written out per file.** Four scaffolding
modules hold them: `platform/tests/testing.ts` builds a whole `Host` and the remote-sync
payloads it speaks in, `api/tests/testing.ts` the router caller, `design/tests/testing.ts` the
binding a declared mutation hands the query library, and `workspace/tests/file.ts` the file a
workspace transfer crosses as. **A hand-written partial of any of them is a shape nothing
produces** — a two-key `Settings`, a `TranslationFunctions` with three of its hundreds, a
`RemoteSyncState` with a field the type does not have — and correcting those was most of what
#561 turned out to be. A test needing the real translations loads the locale
(`loadLocale('en')`, then `i18nObject('en')`) rather than standing one in.

Commands are in [[references/node-test]], including the single-file invocation.

## Rust

A `#[cfg(test)] mod tests` **inside** the file it covers, at its foot. Never a `tests.rs`
gathering the tests of a whole directory: a shared test module hides which file a failure belongs to,
and it survives the split of the module it was written against, so the tests of two
concerns end up in one place with nothing marking the seam.

The cost is paid knowingly. Fixtures used by more than one module are written out in each
of them rather than shared, and a fixture is cheap to duplicate where a subject is not — a
second copy of a builder is worth the file that names its own coverage.

A helper that is genuinely shared scaffolding rather than a fixture — the loopback HTTP server
`sync/google/test/server.rs`, say — is a module of its own under a `test/` directory, not a test
module.

**The asymmetry with TypeScript above is deliberate**, and was settled on 2026-08-18 when the
TypeScript half moved. Rust has a module system doing real work here: `mod tests` is a child of
the module it covers, `use super::*` reaches everything in it including what is private, and a
reader sees the coverage without leaving the file. TypeScript has none of that — a test there
imports a public surface from a separate module whichever directory it sits in — so the only
thing left for the choice to buy is how the tree reads, and a `tests/` directory reads better.

Rust tests run single-threaded; they touch the filesystem and are not isolated from each
other otherwise. See [[references/cargo]].

## Tests that reach a live remote

**Two sets do, and they are the exception rather than a second way of testing.** The four
`losing_writer` tests at the foot of `tauri/src/database/mod.rs` open two replicas of one workspace
against a database they provision on Turso; `control-plane/src/workspace/tests/provisioning.test.ts`
signs up against a live account and reads the schema back off the database that sign-up produced.
Everything else in this repository is tested against a local file, a loopback HTTP server, or an
in-memory engine, and that is not changing.

*Why these could not be: the first measures what the sync engine does when two replicas diverge,
and the engine reaches its remote over HTTP. There is no local stand-in. The loopback
server [[rules/credentials]] endorses under *Transport testing* is the right shape and cannot be
built here, because standing up the replication protocol would mean implementing the behaviour
under test — a bug in the stand-in would read as a finding about Turso. The second is there for a
different reason: what it checks is whether **Turso's own SQL dialect** accepts this schema, and a
`file:` database cannot answer a question about a remote's dialect however faithfully it runs the
same code. Nothing else in the tree has either property.*

**This does not reopen *Transport testing*.** That rule is about a transport whose serialisation
and status handling are the subject; a loopback server exercises those better than a live API
does, and it is still what a new transport gets. What is different here is that the subject is the
remote's own merge behaviour rather than the client's handling of it.

Three things bind a live test, and all three are the reason this is a declared exception rather
than a precedent:

- **The skip reaches the summary line.** In Rust that is `#[ignore]` rather than an early
  `return`: libtest captures the output of a passing test, so a test that printed why it skipped
  and passed reports `ok` on a machine that never reached the remote. In TypeScript it is
  `node:test`'s `{ skip: '<reason>' }`, which is counted as `skipped` and carries the reason. **An
  early return in either is the thing to avoid**, because the shape it produces is a green test
  that measured nothing.
- **It never runs in continuous integration** *(directed by the human, 2026-08-20)*. A required
  gate that provisions databases in somebody's account depends on a third party's uptime and on a
  secret every workflow can read. A live run is a case the human authorizes, one at a time, and
  [[references/turso]], under *Never run*, is where that standing rule already sat. The opt-in is
  `--ignored` on the Rust side and `RENTABLE_LIVE_TURSO=1` on the TypeScript side, because
  `node:test` has no equivalent of `#[ignore]` to ask for by name.
- **Credentials missing is a failure, not a skip.** Asking for an ignored test is deliberate, so a
  run that meant to be live and silently was not is the one outcome worth refusing.

What it costs, said plainly: the behaviour these tests cover is not protected by the gate, so a
regression in it surfaces when somebody runs them rather than when somebody breaks them.

## Characterization tests

Some tests pin behaviour that is **known to be wrong** and are labelled as such in a
comment above them — the contract status model is the standing example. They exist so a
later correction shows up as an intended, visible change.

**Do not "fix" a pinned expectation** to match what the documentation says it should be.
Change the code and the test together, on the ticket that scoped it.
