---
paths:
  - apps/desktop/src/**
  - apps/desktop/tauri/src/**
  - packages/design/src/**
  - packages/turso-platform/**
use-when: "writing or changing a test, or deciding what a change must be tested at"
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when source under any of the four paths listed
  there is read, and costs nothing otherwise.

  The control plane was on that list from 2026-08-18 (#549) until it retired on
  2026-09-12 with [[efforts/819-an-organization-hosts-its-own-workspaces/spec]];
  what it knew about Turso survives as `packages/turso-platform`, and **the
  TypeScript section applies to that package word for word.**

  `packages/design/src/**` was added on 2026-08-23 with #775, and it is the one
  path here the TypeScript section does **not** describe word for word. Read
  *Component tests* before writing a test there.

  It stopped being the only such path on 2026-08-27 with #811, which gave
  `apps/desktop` a runner of its own. *That sentence used to say it was the only
  place in the repository where a second runner collects anything, and it is left
  corrected rather than deleted because the count is the thing that goes stale.*
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

**A fixture for a declared interface is shared, not written out per file.** Five scaffolding
modules hold them: `platform/tests/testing.ts` builds a whole `Host` and the remote-sync
payloads it speaks in, `api/tests/testing.ts` the router caller, `design/tests/testing.ts` the
binding a declared mutation hands the query library, `design/tests/strings.ts` the string
contract a packaged block reads from its provider, and `workspace/tests/file.ts` the file a
workspace transfer crosses as. **A hand-written partial of any of them is a shape nothing
produces** — a two-key `Settings`, a `TranslationFunctions` with three of its hundreds, a
`RemoteSyncState` with a field the type does not have — and correcting those was most of what
#561 turned out to be. A test needing the real translations loads the locale
(`loadLocale('en')`, then `i18nObject('en')`) rather than standing one in.

Commands are in [[references/node-test]], including the single-file invocation.

## Component tests

A component test renders a Svelte component and asserts on what reached the DOM. It lives in a
`tests/` directory the same way every other TypeScript test does, and **Vitest collects it rather
than `node:test`.**

**Two packages have a runner, and the rule for which one a test belongs to is where the component
does.** `packages/design/` has had one since #775. `apps/desktop/` got one at #811, because ten
primitive families had become context reads and the screen that draws them outside every provider
could not be covered at all. A component this application owns is tested here; a packaged one is
tested in the package. **Neither runner reaches across.**

The two configurations are deliberately the same file with one difference, and the difference is
forced. `packages/design/vitest.config.js` uses `svelte()`: the package names its own files with
subpath imports and wants the compiler and nothing else. `apps/desktop/vitest.config.js` uses
`sveltekit()`, because a component here reaches `$lib/...` and `$app/...` and the framework plugin
is what resolves both. Everything else is copied on purpose: `jsdom`, `globals`, a `setupFiles`
holding the same bits-ui scroll-restore wait, and the same `include`. **A change to one is a
question about the other.**

*The setup file is duplicated rather than imported, and that is the export map's doing: the
package's `exports` covers `src/lib/` alone, which is what keeps its fixtures out of every
consumer, so `src/tests/setup.ts` is not something the desktop can reach. The copy says so in its
own header and points at the original for the measurement.*

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

**Each package's `test` script runs both runners.** The package's has since the first nine
`node:test` files crossed with #778; the desktop's since #811. Both are
`node --import tsx --test "src/**/!(*.svelte).test.ts"` and then `vitest run`, and **the extglob is
the whole of what keeps the two apart**: `src/**/*.test.ts`
hands every component test to `node:test` as well. The reason this is written down rather than
left to be noticed is that the failure in the other direction is misleading: measured on
2026-08-23, a `node:test` file collected by Vitest reported `No test suite found in file` and a
summary line of `2 passed` that omitted the failing assertion altogether. The run does exit
non-zero. It just does not say what is wrong.

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
- **A fixture is scaffolding**, and carries no `.test` in its name for the same reason
  `api/tests/testing.ts` does not. **The package's own live in `packages/design/src/tests/`**,
  whatever they cover and wherever the test that uses them sits: `probe.svelte` is the runner's,
  `contract.svelte` and `contract-harness.svelte` are the string contract's, and each
  `<family>-harness.svelte` is a subject that cannot be rendered on its own. **An application's
  fixture lives in the `tests/` directory of the module it serves**, as the TypeScript
  scaffolding above does: `organization/tests/providers.svelte` wraps a surface that needs the
  design and tooltip providers, `layout/tests/rail-providers.svelte` the rail's. *This said every
  fixture lives in the package; that was true while the package held the only rendered tests,
  and effort 824 wrote the desktop's first.*

  The package's directory is outside `src/lib/`, which is what keeps its fixtures out of the package: the
  `exports` map sends `./*` to `./src/lib/*`, so a fixture under the library directory is a
  component every consumer can import, and one of these throws unless something above it renders
  the provider.

  **A module is scaffolding too, and the same reason sends it to the same place.** This is where
  the design package parts from the TypeScript section above, which puts shared scaffolding under
  the directory it covers. `contract-strings.ts` builds a complete `DesignStrings` for a test
  that cares about one key; under `src/lib/tests/` it would be
  `@rentable/design/tests/contract-strings.js` to every consumer. What decides this is the export
  map, not whether the file is a component.

  *The tests themselves do sit under the directory they cover, and are exposed by that same map.
  The asymmetry is deliberate: a `.test.ts` is not something a consumer can mistake for part of
  the interface, and a fixture component is exactly that.*

  **A test outside that directory reaches one through `#tests/<name>`**, which the package's
  `imports` map resolves the way `#lib/*` resolves the library. Added at #780, when the first
  fixtures for tests four directories down arrived and the relative path stopped being readable.
  A test that sits in `src/tests/` itself keeps the relative form, as `probe.svelte.test.ts`
  does: an alias to the directory a file is already in reads as though it points somewhere else.
  `imports` is private to the package, so none of this adds anything a consumer can reach.

- **`$app/*` is supplied by the runner, never by the package.** `back.svelte.ts` in
  `@rentable/design` calls `goto` from `$app/navigation`, every block drawing the back control
  reaches it, and `packages/design/svelte.config.js`
  declares no alias on purpose: an alias in a library is rewritten by `svelte-package` on the way
  out, this package has no build step, and the specifier would reach the consumer resolving
  against *their* tree. So `packages/design/vitest.config.js` carries the alias and points it at
  `src/tests/app-navigation.ts`, which is scaffolding like every other file in that directory and
  is outside the `exports` map that would make it public.

  *Added at #811. Before it, a component test that touched such a module failed at resolution
  rather than at an assertion: `Failed to resolve import "$app/navigation" from
  "src/lib/block/record-surface.svelte"`. The stub records what it was asked to navigate to as
  well as satisfying the import, because where back goes is the navigation worth watching. It said
  `record-surface` wrote the chosen collection into the address from an effect, and was the
  navigation to watch, until effort 832 made a record's sections links.*

  **`apps/desktop` needs none of this.** `sveltekit()` resolves `$app/*` there from the real
  framework, which is the difference between testing an application and testing a library, and it
  is why the two configurations differ in their plugin.

- **Reach for `wrapper` before writing a fixture.** `render(Subject, {}, { wrapper: Provider,
  wrapperProps: { … } })` puts a provider above the subject with nothing in between, which is
  most of what a fixture would have been for, and it is what `globals` is on for. A fixture earns
  its place where `wrapper` cannot reach, which is three cases rather than one. **Where none of
  them holds, there is no fixture**: two of the three block test files added at #781 render their
  subjects directly with their own props, because a block takes props a `.ts` file can write. The
  third took one for the third reason below and for that alone.

  **The subject needs a particular provider above it**, and not the one `wrapper` supplies.
  `contract-harness.svelte` is this: `rerender` drives the subject's props rather than the
  wrapper's, and changing what the provider supplies is the whole of what that one test does.

  **The subject needs two providers rather than one.** `wrapper` puts exactly one component above
  the subject, so a subject that draws a tooltip *and* reads the string contract cannot be reached
  by it: `Tooltip.Root` throws without `Tooltip.Provider`, and since #779 the tooltip's content
  reads `DesignProvider`'s context too. `providers.svelte` is that pair, added at #811 for
  `block/back-control` and for `block/record-surface`'s not-found branch, and it takes the string
  contract's own props so a test hands it the same `wrapperProps` it would hand `DesignProvider`.

  **The subject is not a component but a tree.** A packaged component whose parent creates the
  state it reads, or opens the portal it renders into, cannot be rendered on its own at all:
  `Carousel.Next` reads a context `Carousel.Root` sets, `Dialog.Content` is instantiated by
  `bits-ui` only once the dialog is open, and every sidebar part reads state `Sidebar.Provider`
  creates. Seven of the eight fixtures added at #780 are this, and each says in its own
  docstring what it leaves out and why.

  **The subject takes a snippet.** A snippet is the one kind of prop that cannot be written in a
  `.ts` file at all, so a component with a required one needs a `.svelte` caller whatever else is
  true of it. `form-surface-harness.svelte` at #781 is the only fixture here for this reason
  alone: the subject renders on its own, it just cannot be handed its fields and its actions from
  a test file.

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
`sync/test/server.rs`, say — is a module of its own under a `test/` directory, not a test
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

**Seven sets are admitted, in five properties, and they are the exception rather than a second way
of testing.** All seven exist, and every one is Rust. The four `losing_writer` tests at the foot of
`tauri/src/database/mod.rs` open two replicas of one workspace against a database they provision on
Turso; the six admitted for the organization effort below each create and remove their own.
Everything else in this repository is tested against a local file, a loopback HTTP server, or an
in-memory engine, and that is not changing.

*Why the first could not be: it measures what the sync engine does when two replicas diverge, and
the engine reaches its remote over HTTP. There is no local stand-in. The loopback server
[[rules/credentials]] endorses under *Transport testing* is the right shape and cannot be built
here, because standing up the replication protocol would mean implementing the behaviour under
test, and a bug in the stand-in would read as a finding about Turso.*

*Two admissions retired with the control plane on 2026-09-12
([[efforts/819-an-organization-hosts-its-own-workspaces/spec]], requirement 19):
`control-plane/src/workspace/tests/provisioning.test.ts`, which signed up against a live account
and read the schema back off the database that sign-up produced, and
`control-plane/src/database/tests/hosted.test.ts`, which migrated the control plane's own database
over the wire and asserted that a transaction which throws leaves nothing. The first's property,
whether Turso's own SQL dialect accepts this schema, is held now by the organization effort's
workspace test, which applies the shipped schema over the wire on the account; the second's
property, whether a remote honours what the client asks of it, went with the client that asked.
The heading's count moved from eight sets in seven properties to six in five, and the numbering
of the properties below is kept as they were admitted, so a reader of the tickets finds them.*

**Four more were admitted on 2026-08-30, before any of them was written, and all four exist now.**
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]] puts the customer's own Turso account
at the centre of the product, and four of its criteria cannot be answered anywhere but on one. They
are **three properties, not four**, and the ticket that built each is named so a reader can find
the file. All four are Rust.

**A fourth property: whether the Platform API takes what a Rust port sends.** Ticket 05 moved the
client that was `control-plane/src/workspace/turso.ts` (kept as `packages/turso-platform`) into
`tauri/src/sync/turso/platform.rs`, and its live half creates a database in a group the consent named, mints a credential against that
database, asserts delete protection is on, and deletes the database it just made once that
protection has been lifted. **No group is created.** Nothing available to the application can make
one: the consent screen selects a group and offers no way to create one, and the token cannot
create an organization either
([[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]]), so
requirement 3 of that effort's spec puts the empty group in the customer's hands, in Turso's own
dashboard, before the consent. *This paragraph said the live half created a group as well as a
database until the consent on 2026-08-30 measured otherwise, and it is corrected rather than
deleted for the same reason the count in the heading sentence is.* The in-memory fake that every
caller above it is tested against answers whatever the port was told to answer, so it can confirm
the caller and never the contract. A
loopback server is that same belief written down a second time, and a bug in it would read as a
finding about Turso. A `file:` database has no Platform API at all: this is an HTTP control surface
rather than SQL. The second set above does spend the Platform API on its way to a question about
the dialect, but it spends it from TypeScript and it is not what that set measures. Here the API is
the subject, reached from a different HTTP stack, and a port rewritten in another language has no
other witness that the request shape and the failure vocabulary survived the move.

**A fifth property: whether the remote enforces the limits of a credential we minted. Two
instances.** The first is ticket 14's, for criterion 11: a member holding a `read-only` grant
writes, and the refusal comes back **from Turso** rather than from the interface, with an
administrator's attempt to delete a workspace database refused in the same test for want of
authority rather than for want of a button. The second is ticket 15's, for criterion 14, and it
covers both removal paths and what each costs the members who stay: after an ordinary removal no
new credential is issued to the departing member, their existing one dies at its expiry, and every
remaining member's sync is unbroken; after a lock-out the removed member's existing credential is
refused at once, and every remaining member of that workspace stalls until their application
reaches the organization database and collects a re-sealed grant. **They are one property with two
instances rather than two admissions**, because one sentence covers both and neither carries a
reason the other does not: a credential's scope, its lifetime, and the blast radius of revoking it
are all the same question about who is doing the enforcing.

Nothing local can hold that property. A loopback server or an in-memory fake refuses because we
wrote the refusal, which is the finding restated as a fixture, and a `file:` database has no notion
of a scoped credential to refuse with. What requirement 11 and requirement 14 both claim is that the
authority is the account's rather than the application's, so the account is the only witness whose
answer means anything.

**A sixth property: whether the organization lives on the remote rather than on the machine that
made it. Two instances.** The first is ticket 08's, `organization_live_a_second_machine_reads_what_the_first_wrote`
in `tauri/src/organization/store.rs`: machine A writes the organization's rows through a replica,
machine B opens a second replica of the same database and reads them back verified. The second is
ticket 18's, for criterion 6: machine A provisions, machine A goes offline, and machine B
restores the organization from the link, the email, the password and one consent. *The first
instance was written under this property's sentence and not named here until the effort's review
on 2026-09-12, which is the omission the closing paragraph below warns against.* A `file:` database
sits on one machine by definition, so two processes over one path would prove that a path was
shared and not that anything outlived its first machine. A loopback server and an in-memory engine
are worse, because both die with the process that started them, and that process going away is the
first machine going offline. This is the property the spec's second face asks for, that nobody
including us is a dependency the organization did not agree to, and it is the one in this list
where a passing local test would actively mislead.

**A fifth was admitted on 2026-08-30 as well**, in the re-plan that day's one real consent forced.
It is Rust like the four above and it joins them under the same flag, and it is a new property
rather than another instance of any of them.

**A seventh property: whether Turso's MCP server yields the organization slug for the group a
consent was granted over.** Ticket 21, for criterion 3: one real consent, an `initialize` and one
`tools/call` of `list_databases` against `https://mcp.turso.ai/mcp`, and the slug read out of a
returned hostname matches the account the consent was granted on. **It is the only route to the
slug that exists.** Every Platform API path this effort needs is `/v1/organizations/{slug}/...`, the
numeric `org_id` in the token's claims answers 404 in every one of those paths tried, and the token
answers 403 at the organizations listing
([[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]]).
A loopback server would answer whatever we scripted it to, which is the belief restated as a
fixture, and what is under test is precisely whether Turso's reply carries a hostname in the shape
the parse depends on. An in-memory fake is that same belief a third time, and a `file:` database has
no MCP server to ask. It is not an instance of the fourth property either, because the subject is a
different server speaking a different protocol, and Turso documents this tool set for agents rather
than for clients, which is what makes its shape a question rather than an assumption.

*The count in the heading sentence is the thing that goes stale. Another live test is a decision
somebody takes here, in this section, naming its property and saying whether it is a new property or
another instance of one already listed, and not a file that quietly appears.*

**One flag arms them.** `RENTABLE_LIVE_TURSO=1` was read by the two control-plane files while they
stood, and the Rust tests admitted on 2026-08-30 joined that flag rather than taking one of their
own *(decided in the ticket that admitted the first four; the fifth joined them for the same
reason)*. They carry `#[ignore]` and they read `RENTABLE_LIVE_TURSO`, and both are required. The reason is that `#[ignore]` alone stops being much
of a gate at this size: `cargo test -- --ignored` asks for every ignored test in a crate rather than
for one by name, this effort at least doubles what that sweep reaches, and every test it reaches
provisions on somebody's account. **A Rust live test that runs with the flag unset fails rather
than skipping**, and its message names the flag, so a sweep nobody meant as a live run costs a
failed run instead of a handful of databases. A second flag name was rejected: it would be one more
thing to know, and the only hazard it prevents that this one does not is that both halves can be
armed by one export, which nobody has been bitten by.

**The four `losing_writer` tests are not retrofitted here.** `#[ignore]` is still their whole
opt-in, so `cargo test -- --ignored` reaches them with the flag unset. Bringing them onto the flag
is a change to source, and what is decided here is documentation.

**This does not reopen *Transport testing*.** That rule is about a transport whose serialisation
and status handling are the subject; a loopback server exercises those better than a live API
does, and it is still what a new transport gets. What is different here is that the subject is the
remote's own behaviour rather than the client's handling of it.

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
  `#[ignore]` on the Rust side, joined by `RENTABLE_LIVE_TURSO=1` for the five admitted above, and
  `RENTABLE_LIVE_TURSO=1` alone on the TypeScript side, because `node:test` has no equivalent of
  `#[ignore]` to ask for by name.
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
