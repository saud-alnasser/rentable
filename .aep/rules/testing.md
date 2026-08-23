---
aep: 2.7.0
owner: repository
date: 2026-08-23
kind: rule
paths:
  - apps/desktop/src/**
  - apps/desktop/tauri/src/**
  - apps/control-plane/src/**
  - packages/design/src/**
use-when: "writing or changing a test, or deciding what a change must be tested at"
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when source under any of the four paths listed
  there is read, and costs nothing otherwise.

  The control plane was added to that list on 2026-08-18 with #549. **The
  TypeScript section applies to it word for word.** The Rust section has no
  subject there and the router level has none yet; when the control plane grows
  routes, they are covered end to end against a real database for the same
  reason the desktop's are.

  `packages/design/src/**` was added on 2026-08-23 with #775, and it is the one
  path here the TypeScript section does **not** describe word for word. Read
  *Component tests* before writing a test there: it is the only place in the
  repository where a second runner collects anything.
-->

# Testing

## TypeScript

**This section describes every test that does not render a component.** One that does is
collected by a different runner and is covered under *Component tests* below. Nothing this
section covers moved when that runner arrived, and nothing is meant to.

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

## Component tests

A component test renders a Svelte component and asserts on what reached the DOM. It lives in
`packages/design/`, in a `tests/` directory the same way every other TypeScript test does, and
**Vitest collects it rather than `node:test`.**

*Why there are two runners rather than one: `node:test` works through `tsx`, and `tsx` fails on a
`.svelte` import with `ERR_UNKNOWN_FILE_EXTENSION`. No flag fixes that — compiling a component
needs the Svelte compiler in the module pipeline, which is what `@sveltejs/vite-plugin-svelte`
is. Svelte's own documentation recommends Vitest for exactly this, and points at
`@testing-library/svelte` over the lower-level `mount` API, which it calls "somewhat brittle".*

**It is named `<name>.svelte.test.ts`, and that is the whole of what separates the two runners.**
The `.svelte.` segment is not decoration. It is what lets the file use runes at all: the same file
named `<name>.test.ts` raises `rune_outside_svelte` the moment it reaches `$effect.root()`, and
renaming it is the entire fix. It is also what keeps Vitest off a `node:test` file, because
`vitest.config.js` includes that shape and nothing wider.

**Nothing `node:test` covers today moves to the other runner.** Those suites are pure logic,
routers and runes; none of them renders, and a DOM buys them nothing. A module that moves into
the design package takes its `node:test` test with it, keeps the plain `<name>.test.ts` name, and
keeps running under `node:test`.

**That last sentence is a promise the package's `test` script does not yet keep.** It runs
`vitest run` alone, because no `node:test` file has moved into the package yet. **The ticket that
moves the first one adds the `node:test` invocation beside it**, and the reason this is written
down rather than left to be noticed is that the failure is misleading: measured on 2026-08-23, a
`node:test` file collected by Vitest reported `No test suite found in file` and a summary line of
`2 passed` that omitted the failing assertion altogether. The run does exit non-zero. It just does
not say what is wrong.

Three things bind a component test, and each of them is a way of passing while measuring nothing:

- **An effect exercised outside a component needs `$effect.root()` and `flushSync()`**, in a file
  named as above. Inside a component, `render` mounts it and its effects run. A rune module tested
  directly has no root, so its effects never fire and the test is green having run none of the
  code it names.
- **`globals` is on in `vitest.config.js`, and it is not there for the convenience.**
  `@testing-library/svelte` registers its `beforeEach` and `afterEach` hooks only when it finds
  those functions as globals, and the first of them is what calls its `setup()`. Without
  `setup()`, the `wrapper` option throws `WrapperNotSetupError` on use — and `wrapper` is how a
  component that reads its strings from context is rendered under test at all. A test file still
  imports `test` and `expect` explicitly; nothing here relies on a global being in scope.
- **A fixture component is scaffolding**, and carries no `.test` in its name for the same reason
  `api/tests/testing.ts` does not. **Every one of them lives in `packages/design/src/tests/`**,
  whatever it covers and wherever the test that uses it sits: `probe.svelte` is the runner's,
  `contract.svelte` and `contract-harness.svelte` are the string contract's. That directory is
  outside `src/lib/`, which is what keeps them out of the package: the `exports` map sends `./*`
  to `./src/lib/*`, so a fixture under the library directory is a component every consumer can
  import, and one of these throws unless something above it renders the provider.

  *The tests themselves do sit under the directory they cover, and are exposed by that same map.
  The asymmetry is deliberate: a `.test.ts` is not something a consumer can mistake for part of
  the interface, and a fixture component is exactly that.*

- **Reach for `wrapper` before writing a fixture.** `render(Subject, {}, { wrapper: Provider,
  wrapperProps: { … } })` puts a provider above the subject with nothing in between, which is
  most of what a fixture would have been for, and it is what `globals` is on for. A fixture earns
  its place where `wrapper` cannot reach: `contract-harness.svelte` exists because `rerender`
  drives the subject's props rather than the wrapper's, and changing what the provider supplies
  is the whole of what that one test does.

Commands are in [[references/vitest]], including the single-file invocation.

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

**Three sets do, and they are the exception rather than a second way of testing.** The four
`losing_writer` tests at the foot of `tauri/src/database/mod.rs` open two replicas of one workspace
against a database they provision on Turso; `control-plane/src/workspace/tests/provisioning.test.ts`
signs up against a live account and reads the schema back off the database that sign-up produced;
`control-plane/src/database/tests/hosted.test.ts` migrates the control plane's *own* database over
the wire, serves a sign-in from it, and asserts that a transaction which throws leaves nothing.
Everything else in this repository is tested against a local file, a loopback HTTP server, or an
in-memory engine, and that is not changing.

*Why these could not be: the first measures what the sync engine does when two replicas diverge,
and the engine reaches its remote over HTTP. There is no local stand-in. The loopback
server [[rules/credentials]] endorses under *Transport testing* is the right shape and cannot be
built here, because standing up the replication protocol would mean implementing the behaviour
under test — a bug in the stand-in would read as a finding about Turso. The second is there for a
different reason: what it checks is whether **Turso's own SQL dialect** accepts this schema, and a
`file:` database cannot answer a question about a remote's dialect however faithfully it runs the
same code.*

**The third arrived on 2026-08-22 with #757, and it is a third property rather than a third
instance of the first two.** The schema of the control plane's own database was already exercised,
by every test in that package, against a file. What had never happened is the wire: the client, the
token, and an interactive transaction crossing a network to a hosted database. A `file:` database
cannot answer whether a remote honours `BEGIN`, and the effort that moved those records onto Turso
rested on the assumption that it does. So the property is **whether a remote honours what the
client asks of it**, and it is admitted here rather than absorbed silently into one of the two
above.

*The count in the heading sentence is the thing that goes stale. A fourth live test is a decision
somebody takes here, in this section, naming its property, and not a file that quietly appears.*

**One flag arms all the TypeScript ones.** `RENTABLE_LIVE_TURSO=1` is read by both control-plane
files and the suite glob collects both, so setting it for a whole run provisions workspace
databases whether or not that is what was wanted. Ask for a live file by name
([[references/node-test]], *Run one file*) rather than setting the opt-in in a `.env`.

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
