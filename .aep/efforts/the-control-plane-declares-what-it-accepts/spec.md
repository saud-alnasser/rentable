---
aep: 2.7.0
owner: repository
date: 2026-08-22
kind: spec
status: implemented
---

# Problem

`apps/control-plane/src/server/server.ts` is 446 lines, and most of what it is doing is not the
control plane's job. It dispatches its own routes, reads its own bodies, extracts its own fields,
and turns its own errors into responses. Five routes cost that much because every one of those
things is written out again.

**Routing is a chain that has to be read top to bottom.** `controlPlaneServer` ends in a
sequence of `if` statements over `request.method` and `request.url`, two of them against regular
expressions built inline. Nothing anywhere lists what routes exist; the list *is* the chain, and
the 404 at the bottom is what happens when you fall off it. Adding a route means editing the
middle of a function that already holds four.

**Validation is hand-written, per field, per route, and this is the part worth being precise
about.** It is not missing: `schemaVersionIn` checks that `schemaVersion` is an integer above
zero, and `workspaceNameIn` checks the name. Both raise a `Refusal(MALFORMED, 400, ...)` with a
sentence somebody wrote. What is missing is any *declaration* of what a route accepts. The shape
lives in imperative code, one function per field, so nothing can be read off, nothing can be
published, and a sixth route's author has to remember that this is how it is done here. Between
`readJsonBody` and the extractors sits `parsed as Record<string, unknown>`, which is the point
where an unvalidated body is asserted into a type and handed on.

**Nothing declares what a route answers with.** `wireAccount`, `wireSession` and `wireWorkspace`
build response bodies by hand. They are careful, and `wireWorkspace`'s comment records that a
workspace's permissions are the asking account's rather than the row's — but that carefulness is
a convention, not a contract. A field added to `Workspace` and spread into a response is a field
that ships.

**What the process says about itself is unstructured.** `console.error('control plane failed to
answer', error)` in the catch, `console.info` at startup. No request identifier, so two
concurrent requests interleave with nothing to tell them apart, and a failure cannot be tied to
the request that caused it.

**Nothing is deployed**, which is exactly why this is cheap now and expensive later. There is no
running instance whose behaviour has to be preserved through the change, and no operator whose
habits depend on the current output.

# Goal

The control plane's HTTP surface is declared: a reader can see every route, what each one
accepts, and what each one answers with, in one place and without reading a dispatch chain. What
it logs is structured and correlated. Its handlers hold the control plane's logic and nothing
about HTTP mechanics.

And the property the test suite rests on is unchanged: the database, the clock, Google and Turso
are still arguments, and the 40 tests of `server/tests/server.test.ts` still drive the real routes
against a real database.

*Corrected 2026-08-22 during refine. The brief that opened this effort said "132 tests run the
real routes against a real database", and this file repeated it. 132 is the whole suite, across
twelve files; 40 of them are the server's. The distinction matters twice: it is the true size of
what the dependency-injection constraint protects, and it is what acceptance criterion 9 counts.*

# Scope

`apps/control-plane/` only. The HTTP surface, the module structure around it, and the logging the
process does — the routes' and, since 2026-08-22, the three commands' as well. Fastify replaces
`node:http` and its hand-rolled dispatch.

*Fastify is the human's choice, made on 2026-08-22 when this effort was opened, and this file
records it rather than argues it. No comparison against `hono`, `express` or staying on
`node:http` with a router was run.*

The domain modules underneath — `account/`, `session/`, `workspace/`, `database/` — are not the
subject. They are touched only where a signature has to change to receive what a route hands it.

# Requirements

1. **Every route is declared, in one place, with its method and path.** A reader who wants to
   know what this service answers reads a list rather than a control-flow chain.

2. **Every route declares the shape it accepts**, and a request that does not match is refused
   before the handler's own logic runs — but **after** the handler has established who is asking.
   The hand-written per-field extractors go.

   *Narrowed during refine on 2026-08-22, and it was not a wording fix. It read "refused before
   the handler runs", which contradicted requirement 4 outright rather than sitting in tension
   with it. `mint` and `rename` both call `asking` first and validate second
   (`server.ts:292-293`, `server.ts:360-361`), so today an unauthenticated caller sending a bad
   body is told `unauthenticated`. Fastify's default pipeline validates first and would answer
   `malformed_request`. One of the two requirements had to give; the human gave this one, on
   2026-08-22. The order is now a constraint below rather than an implementation detail, because
   the framework's default is the other way and a later change will drift back to it by doing
   nothing.*

3. **Every route declares the shape it answers with, and the declaration is enforced at runtime**
   — the response is serialized through it rather than built by hand, so a field the declaration
   does not name cannot reach the wire. *Enforcing rather than documenting, decided by the human
   on 2026-08-22; what that costs is the second risk below.*

4. **The wire contract does not change.** Same paths, same methods, same status codes, same body
   shapes, same refusal codes from `failure.ts`.

5. **One error handler turns a `Refusal` into its status and body**, and turns anything else into
   the generic 500 without leaking its text. No route repeats it.

6. **Logging is structured, and everything a request emits carries one identifier for that
   request.** A failure can be tied to the request that caused it.

6a. **The three commands log through the same logger**, without a request identifier, because they
    have no request. `sweep.ts`, `decline.ts` and `prune.ts` stop using `console`. *Added on
    2026-08-22: this was raised as an open question, it was scope rather than a question, and the
    human took it in. The reason it is worth the extra surface is that the alternative is a
    process with two ways of saying things, and the seam between them is not the kind that gets
    closed later.*

7. **`ControlPlane` stays an argument.** The database, the clock, `verifyIdentity`, `platform`
   and `connectToWorkspace` reach a handler because they were passed in, never because they were
   attached to the framework.

8. **The module structure holds `[[rules/module-layout]]`.** Concepts stay grouped as they are;
   whatever the HTTP surface grows lives under `server/`.

# Acceptance Criteria

1. A single file lists all five routes with their methods and paths, and a search of the tree
   finds no `request.url` comparison and no inline regular expression over a path. *(R1)*

2. For each route that takes a body, a request whose body is the wrong shape is refused with the
   same code and status the hand-written extractor gave, and a test drives one malformed request
   per route. `schemaVersionIn` and `workspaceNameIn` no longer exist. *(R2)*

2a. **A request with no credential and a malformed body is answered `unauthenticated`, not
    `malformed_request`, on both `/workspace/:id/token` and `/workspace/:id/name`.** One test per
    route, sending both faults at once, asserting the code. **Two kinds of malformed, and the
    second is the one that discriminates**: a body that parses but has the wrong shape, and a body
    that is not JSON at all. Only the second tells `onRequest` apart from `preValidation`.
    *(R2, R4)*

    *This is the criterion that holds the decision above, and it is written as a test rather than
    as prose for a reason: the prose version is a sentence that survives a refactor which has
    already broken it. Nothing else here fails when validation quietly moves back in front of
    authentication, because every other test sends a valid credential.*

3. A response declaration exists per route, and a field present on the object a handler returns
   but absent from the declaration does not appear in the response body. Driven by a test that
   returns such a field rather than by reading the declarations. *(R3)*

3a. Every field the Rust client reads is named in a declaration. Checked once, by hand, against
    `apps/desktop/tauri/src/sync/control.rs`, and the check is written into the pull request.
    *(R3, R4)*

    *Serialization drops what it does not know about and says nothing. Criterion 4 catches that
    for every field an existing test asserts, which is most of them and not all of them; this is
    the sweep for the remainder, done once at the moment the declarations are written rather than
    left to the first person who notices a field missing in production.*

4. The existing `server.test.ts` passes with no change to what it asserts about status codes,
   bodies or refusal codes. Where a test changes, it is because of how the server is started,
   never because of what it answered. *(R4)*

5. A route that raises a `Refusal` produces its status and `refusalBody`; a route that throws
   anything else produces 500 with the generic message and nothing from the error. Both driven by
   tests, and neither route contains the handling. *(R5)*

6. Two requests handled concurrently produce log lines that can be told apart by an identifier,
   and a failing request's error line carries the same identifier as its request line. Driven by
   a test over the logger rather than by reading output. *(R6)*

6a. `sweep.ts`, `decline.ts` and `prune.ts` contain no `console.` call, and neither does
    `server/`. *(R6, R6a)*

    *Scoped to those four deliberately. A sweep of the tree on 2026-08-22 found console calls in
    four further places, and three of them are domain modules this effort does not touch. They are
    listed under Open Questions rather than swept in here.*

7. A search of the tree finds no route handler reaching a database, a clock, Google or Turso
   through the framework instance. `controlPlaneServer`, or whatever replaces it, still takes a
   `ControlPlane` and returns something the tests can listen on. *(R7)*

8. `pnpm check` and `pnpm lint` pass, no directory named `utils` or `common` appears, and `tests/`
   is still the only plural directory name. *(R8)*

9. **No existing test is deleted, and none is weakened.** Every one of the 40 top-level tests in
   `server/tests/server.test.ts` is still present and still asserts what it asserted; the suite
   still reports its two pre-existing skips; the twelve test files are still twelve. Tests added
   by criteria 2, 3, 5 and 6 are counted separately and named in the pull request, so the total
   moves by a number somebody wrote down rather than by a number nobody checked. *(R4)*

   *Rewritten during refine on 2026-08-22. It read "the same test count ... allowing for tests
   added by criteria 2, 3, 5 and 6", which no result could fail: any count at all was explained
   by the allowance, including a count that had lost a test and gained two. It also cited no
   requirement.*

# Constraints

- **`ControlPlane` is an argument and never ambient.** This is the one that will be under
  pressure the whole way, because Fastify's idiom is the opposite: `fastify.decorate('db', ...)`
  and reach for it from a handler. Everything ambient being an argument is what lets
  `server.test.ts` run the real routes against a real database and a fake Google, which is 40 of
  the suite's tests. A migration that adopts the idiom would dismantle the property quietly, one
  convenient decorator at a time.

- **The wire is a public contract with a client that is not TypeScript.** The Rust side speaks
  these routes, and it does not regenerate from a schema. A shape that changes is a client that
  breaks, and nothing about this change is worth that.

- **The refusal *code* is the contract. The message is not, and the client says so itself.**
  Checked on 2026-08-22 against `apps/desktop/tauri/src/sync/control.rs`, which is the only
  client. `refusal()` at line 388 carries the rule as a doc comment: *"The code is what is read,
  never the prose. The control plane writes its message for a person and this application shows
  its own, translated."* Every branch in it matches on `code`, and `membership_ended()` at line
  377 adds *"Read off the code and never off the status"* — a 403 is also a declined session, and
  reading the status instead would delete a replica over a routing mistake.

  So the codes and the statuses are frozen and the sentences are not. **That is a licence with an
  edge, and the edge is worth stating**: the message is not discarded, it is interpolated into
  `Error::Forbidden`/`Error::Network` (`the control plane refused this request ({code}):
  {message}`), which is what reaches a diagnostics line. Changing a sentence is not a client
  break; it is a change to what a diagnostic reads like, and that is the whole of the cost.

- **Authentication runs before validation, and the framework's default is the other way round.**
  Decided by the human on 2026-08-22 against the alternative of taking Fastify's order and
  amending the wire contract for it. A caller with no credential is told `unauthenticated` and is
  not told which of their fields was wrong, on every route that has both checks.

  **This is the constraint most likely to be lost by accident**, and it is worth saying how: it is
  lost by *doing nothing*. Attaching a body schema to a route the ordinary way puts validation in
  front of the auth hook, and everything keeps passing, because every other test in
  `server.test.ts` sends a valid credential. Criterion 2a is the test that fails instead.

  **`preValidation` is the trap, and its name is why.** It reads as *before validation*, it is
  before validation, and it is still after parsing. Measured on 2026-08-22 and written up under
  Technical Approach: the hook is `onRequest`.

- **`failure.ts` stays the source of truth for refusal codes.** Fourteen codes live there with
  the reasoning for each. A schema library's own error vocabulary does not replace them and does
  not get mixed with them.

- **Routes are covered end to end against a real database, and over a real socket** —
  `[[rules/testing]]`, which names the control plane explicitly. Whatever the server becomes has
  to be startable by a test and reachable by `fetch` on a real port. Fastify's `inject()` is
  faster and skips the transport, which is the half `server.test.ts` exists for and the half this
  change is replacing. *Settled during refine on 2026-08-22; it stood as an open question.*

- **`[[rules/module-layout]]` governs anything new.** Grouped by concept; no `utils`, no
  `common`, no plural directory but `tests/`.

- **The desktop is not touched.** It does not call these routes; the Rust side does.

# Out of Scope

- **Deployment.** No Dockerfile, no host configuration, no process manager. There is none today
  and this change does not add one. *Directed by the human on 2026-08-22 when the scope was set.*

- **Metrics and tracing.** No counters, no spans, no exporter.

- **Rate limiting**, on sign-in or anywhere else.

- **Splitting liveness from readiness.** `/health` keeps its one meaning and its one behaviour.

- **Config validation beyond what `main.ts` already does.** The three `required()` calls stay as
  they are.

- **Anything about who may call.** Sessions, the Google exchange, the three-day window and the
  permission check are untouched. This change is about how a request is received and answered.

- **The `oneAtATime` defect** at `workspace/migration.ts:184` and the native crash of
  [#719](https://github.com/saud-alnasser/rentable/issues/719). Both are in this package and
  neither is this effort's.

# Assumptions

- **Fastify 5 runs under Node 24 with `tsx` and `node:test`**, importing `.ts` sources directly,
  the way every other module here does. **Unverified, and it is the one assumption here that no
  amount of further discussion can settle** — `[[policies/engineering]]` routes a technical
  uncertainty to `[[skills/prototype]]`, and this is that. If it is wrong the approach changes
  rather than bends, so it is worth an hour before the plan is written rather than a week after.
  Left as an assumption at the close of refine on 2026-08-22 because refine is the wrong
  instrument for it, not because it is unimportant.

  Two narrower things ride on it and would be settled by the same throwaway: whether a Fastify
  server built this way is startable and `fetch`-able from a `node:test` file the way
  `runningControlPlane` is, and whether the ordering constraint above is expressible without
  fighting the framework.

- **Fastify's schema validation can express what the two extractors express** — an integer above
  zero, and a trimmed string within `WORKSPACE_NAME_LIMIT`. Probably, but the *message* is the
  open question below.

*The third assumption here was **the Rust client does not depend on the text of a refusal
message**, marked unchecked. It was checked on 2026-08-22 and is no longer an assumption; it is
the second constraint above.*

# Open Questions

*Two questions stood here on 2026-08-22 and both were answered during refine rather than carried.*

*The first was **do the validation messages stay word for word**. It turned on whether anything
reads the message, and the client says in its own comments that nothing does. They do not have to
survive; the codes and statuses do. Recorded as the second constraint above, with the one cost
that survives the answer.*

*The second was **do the tests keep going over a real socket**. Kept, and it is a constraint now
rather than a question. `[[rules/testing]]` names the control plane and says its routes are
covered end to end; the README records that half of what `server.test.ts` covers is the transport;
this effort raised no new argument against either. `inject()` is faster and skips exactly the half
that is the reason those tests exist, and a migration is the worst moment to stop exercising the
transport, because the transport is the thing being replaced. Reversible later on its own merits,
and not by this effort in passing.*

- **Four console sites are left, and somebody has to say whether they stay.** The commands
  question that stood here was answered on 2026-08-22 and became requirement 6a. Sweeping the
  tree to write that requirement turned up four more, which the original problem statement had
  missed:

  | Where | What | Why it is not simply folded in |
  | --- | --- | --- |
  | `main.ts` | the startup line, and a fatal `console.error` | it runs before a server exists, so it may have nothing to log through |
  | `workspace/migration.ts` | `could not ${what}` | domain module, outside this effort's scope |
  | `workspace/turso.ts` | three, on Turso's refusals | domain module, outside this effort's scope |
  | `workspace/workspace.ts` | one | domain module, outside this effort's scope |

  **Raised rather than taken.** The scope says the domain modules are not the subject and are
  touched only where a signature must change; converting their logging is neither. `main.ts` is
  the arguable one and the argument is real in both directions. Left here so that requirement 6a
  does not read as *the process now logs structurally* when four places still do not.

# Risks

- **The DI constraint erodes rather than breaks.** No single decorator looks like the moment the
  property was lost. It shows up as a test that has to construct a framework instance to test a
  handler, and by then it is not one change to undo.

- **Schema-driven serialization drops a field silently, and this risk was accepted rather than
  avoided.** It is the same mechanism twice: what makes criterion 3 enforceable is exactly what
  makes a field that exists, is set, and is missing from the declaration simply not appear. A wire
  change with no error anywhere. **Taken knowingly by the human on 2026-08-22**, over the
  documenting-only alternative, which removes the risk and removes the enforcement with it.

  Two things stand between the risk and the wire, and neither is a review: criterion 4, because
  the 40 existing tests already assert the fields the client reads, and criterion 3a, the one
  manual pass over the Rust client for whatever no test asserts. If either is dropped during
  implementation, this risk is unmitigated and the decision above was made on a false premise.

- *The third risk here was **a validation failure that used to be a domain refusal**. It was not a
  risk. It was requirement 2 and requirement 4 contradicting each other, and it is settled: see
  the ordering constraint above, requirement 2's note, and criterion 2a.*

- **The 446 lines do not shrink, they move.** Declarations are code too. The gain is that a
  reader can find what a route accepts without reading how it is extracted, not that there is
  less of it.

# Architecture

Fastify replaces `node:http`, and the shape is **approach C of three**, chosen by the human on
2026-08-22: routes are declared flat in one file, handlers live in files named for their concept,
and `ControlPlane` reaches every handler by being closed over at registration.

*The two rejected approaches, so they are not re-proposed. **A, a descriptor table walked by a
registrar**: routes become data and authentication becomes a boolean field, which is uniform and
which invents a second framework nobody documented, over five routes. **B, a Fastify plugin per
concept**: the framework's own idiom, and the one shape that erodes the constraint this effort
exists to protect, because plugin options are how `decorate` arrives one convenience at a time.
The route list would also stop being a list.*

```
server/
  server.ts        builds the instance, installs the error handler, returns it unlistened
  routes.ts        all five routes, declared. THIS IS THE FILE CRITERION 1 NAMES
  authenticate.ts  the preValidation hook, built from a plane
  schema.ts        request and response declarations
  account.ts       identify
  workspace.ts     mint, rename
  health.ts        health
  tests/
```

**No plugin is registered and no decorator is called.** Not as a matter of taste: a handler is
built by a factory that takes the plane and returns the Fastify handler, so there is no path by
which a handler could reach a database except the argument. The property is structural rather
than remembered.

# Interfaces

```ts
// server/routes.ts — the whole surface, and the only place it is written down.
export const routes = (app: FastifyInstance, plane: ControlPlane): void => {
	const authenticated = { preValidation: authenticate(plane) };

	app.get('/health', { schema: healthSchema }, health(plane));
	app.post('/account/sign-in', { ...authenticated, schema: identifySchema }, identify(plane));
	app.post('/session/refresh', { ...authenticated, schema: identifySchema }, identify(plane));
	app.post('/workspace/:workspaceId/token', { ...authenticated, schema: mintSchema }, mint(plane));
	app.post('/workspace/:workspaceId/name', { ...authenticated, schema: renameSchema }, rename(plane));
};
```

`controlPlaneServer(plane)` keeps its name and its signature. It returns something with `listen`
and `close`; `runningControlPlane` in `tests/testing.ts` changes only in how it starts the thing,
which is what criterion 4 permits.

# Technical Approach

## Authentication precedes validation, and the hook is `onRequest`

**Corrected 2026-08-22, during implementation of #742, and the correction is the whole reason
this subsection is worth reading.** It said `preValidation`, on the strength of a prototype that
sent syntactically valid JSON with the wrong types in it. That prototype was not wrong; it was
narrow. Measured against a body that is not JSON at all:

| hook | no credential, unparseable body | today, in `server.ts` |
| --- | --- | --- |
| `preValidation` | **400** | 401 |
| `onRequest` | **401** | 401 |

Fastify's lifecycle parses the body *before* `preValidation` runs, so a JSON syntax error is
answered before authentication is ever consulted. `preValidation` therefore satisfies the
ordering constraint against a malformed *shape* and breaks it against a malformed *body*, which
is the narrower half of what requirement 2 and criterion 2a mean.

`onRequest` runs before parsing, so authentication precedes both parsing and validation. That is
exactly what `server.ts` does today, where `asking` is called and only then is `readJsonBody`
awaited. **`preHandler` is wrong for the same reason and worse**, running after validation.

*Recorded rather than quietly fixed because the first answer was reached by a prototype and the
second by a better prototype. The lesson is about the instrument: a technical question answered
with one example was answered for that example.*

**An empty body with a JSON content type has to be parsed rather than refused.** Measured on
2026-08-22: Fastify answers `FST_ERR_CTP_EMPTY_JSON_BODY`, 400, where `readJsonBody` returns
`{}`. It is not a hypothetical: `tests/testing.ts`'s `post` helper always sends
`content-type: application/json`, and the sign-in and refresh routes are called with no body at
all, so every one of those tests would fail. A content-type parser that answers `{}` to an empty
body is what keeps them passing, and it restores `readJsonBody`'s behaviour rather than inventing
one.

**The hook is attached per route and never to the instance.** The prototype registered it globally
the obvious way and `/health` answered 401. Recorded in
[[efforts/the-control-plane-declares-what-it-accepts/evidence/prototypes/fastify-under-tsx-and-node-test]].

**`asking` is not only authentication, and this is why its position matters more than which refusal
code comes back.** It creates the account on a first Google token, provisions that account's
workspace idempotently, and starts or resumes a session, which is a database write. Those side
effects happen today before any body is read, and running it in `preValidation` keeps that exactly.
An approach that validated first would also stop provisioning an account for a request whose body
was malformed. That is a behaviour change nobody asked for, and no existing test would have caught
it.

The hook puts the account and the session on the request; the handler reads them back. That is
state on a request rather than on the framework, and it is per request rather than ambient.

## One error handler, and what it has to map

`setErrorHandler` is the only place a failure becomes a response. The rows below were verified
against Fastify 5.12.1 in the prototype, except the two marked otherwise.

| Arriving as | Answered with |
| --- | --- |
| `Refusal` | `error.status` and `refusalBody(error)`, unchanged |
| a validation failure, `error.validation` truthy | `MALFORMED`, 400 |
| `FST_ERR_CTP_BODY_TOO_LARGE` | `MALFORMED`, 413, replacing `MAXIMUM_BODY_BYTES` in `readJsonBody`. *Status verified; the mapped body shape was not* |
| `FST_ERR_CTP_EMPTY_JSON_BODY` | never reaches here. A content-type parser answers `{}` to an empty body, exactly as `readJsonBody` does. *Measured 2026-08-22* |
| `FST_ERR_CTP_INVALID_MEDIA_TYPE` | never raised. See Migration for what happens instead. *Measured 2026-08-22* |
| anything else | 500, generic text, nothing from the error |

**One more thing the framework decides, found by a failing test rather than by reading.** Fastify
configures AJV with `coerceTypes` on, so `{"name": 7}` is quietly read as `{"name": "7"}` and
stored as the string `7`, where `workspaceNameIn` refused it. It is switched off. A declaration
that coerces describes what a caller *may be read as* rather than what it *may send*, which is the
opposite of the property this effort is for.

`setNotFoundHandler` answers `no_such_route` with *there is nothing here*, because Fastify's
default 404 carries its own shape and `server.ts:430` is a contract like any other.

## What the declarations can express, and the one thing they cannot

`schemaVersion` becomes `{ type: 'integer', minimum: 1 }`, which is exactly what `schemaVersionIn`
checks. That extractor dies completely.

**`workspaceNameIn` does not translate cleanly, and pretending otherwise would be a silent
behaviour change.** It checks the *trimmed* string: `'   '` is refused, and the 120-character limit
is measured after trimming. JSON Schema has no trim. So the rule splits, deliberately:

- the schema carries `{ type: 'string', pattern: '\\S' }`, which refuses a blank name, and a
  `maxLength` above the limit as a size bound rather than as the rule
- **the trimmed-length check survives, moved into `renameWorkspace`**, where it belongs: it is a
  rule about what this service will store, not about what a request may look like

*Criterion 2 still holds as written, because both named functions are gone. What is recorded here
is that one rule inside one of them is not expressible as a declaration and was moved rather than
dropped. The alternative is discovering it through a name with a trailing space.*

The three bespoke name messages collapse into one derived from the validation failure. Permitted by
the second constraint, and the client's own comment at `control.rs:445` says the desktop form
validates before it calls, so those sentences were already not what a person reads.

## Logging

Fastify's built-in `pino` logger stamps `reqId` on every line a request emits, which is requirement
6 without new machinery. The instance takes a `logger` option so a test can pass a sink and assert
on it, which is what criterion 6 asks for. `sweep.ts`, `decline.ts` and `prune.ts` take the same
logger with no request identifier, which is requirement 6a.

# Migration

**Not a migration in the data sense. Nothing is stored and nothing is deployed**, so this is a
cutover in one branch with no compatibility window and no flag.

One wire behaviour changes, deliberately, with the human's agreement on 2026-08-22:

> A request carrying a JSON body with no `content-type: application/json` header is answered
> **400 `malformed_request`** on the two routes that declare a body, where it is answered 200
> today. `readJsonBody` never read the header. The two routes that declare no body are unaffected
> and still answer 200.

*This paragraph said **415**, on the whole surface, until it was measured on 2026-08-22 during
#742. Fastify raises no media-type error here at all: the body is simply never parsed, the route
sees `undefined`, and the declaration refuses it as it would any other wrong shape. The correction
matters twice. The status is one a client already handles rather than a new one, and the blast
radius is two routes rather than five. Pinned by a test, because a wire change that is documented
and untested is a wire change waiting to be reverted by accident.*

**Checked before accepting rather than assumed**: the only client sets the header on every body it
sends, at `apps/desktop/tauri/src/sync/control.rs:244` and `:332`. This is the one named exception
to requirement 4, and it is recorded here rather than in a commit message because a reader of
requirement 4 needs to be able to find it.

# Testing Strategy

| Criterion | How it is checked |
| --- | --- |
| 1 | `routes.ts` holds five declarations. A grep over `src/` for `request.url` and for an inline path regex returns nothing |
| 2 | One malformed request per body-taking route, asserting code and status. Neither extractor exists |
| 2a | **The load-bearing test.** No credential plus a malformed body, on both workspace routes, asserting `unauthenticated`. It is the only test that fails when the hook drifts to `preHandler`, because every other test sends a valid credential |
| 3 | A handler returns an object carrying an undeclared field; the response body does not have it |
| 3a | One manual pass over `control.rs` against the response declarations, written into the pull request |
| 4 | The 40 existing tests in `server.test.ts` run unchanged except for how the server starts |
| 5 | A route raising a `Refusal` and a route throwing an `Error`, asserting the generic 500 carries nothing from the error |
| 6 | A logger sink passed to the instance; two concurrent requests, asserting distinct `reqId`, and that a failure line shares its own request's |
| 6a | A grep for `console.` over the three commands and `server/` |
| 7 | A grep for `decorate`, and for `app.` inside a handler file. `controlPlaneServer` still takes a `ControlPlane` |
| 8 | `pnpm check`, `pnpm lint`, and the directory listing under Architecture |
| 9 | The 40 tests still present, the two skips still reported, new tests named in the pull request |

**The tests keep their real socket.** `runningControlPlane` still listens on port 0 and the tests
still `fetch` it. `inject()` is not used, per the constraint.

# Technical Risks

- **`preValidation` becomes `preHandler`, and nothing goes red but one test.** The mitigation is
  that it is written down in three places now and criterion 2a is the test. If that test is ever
  deleted as redundant, the constraint is unguarded.

- **`asking` inside a hook makes its side effects easier to miss.** It writes to the database, and a
  hook reads as a check. The next person to add a route gets account creation and workspace
  provisioning by typing `...authenticated`, which is correct and is not visible.

- **The response declarations are written once and then enforce forever.** Criterion 3a is a manual
  pass, and a manual pass is the weakest thing in this plan. It is here because serialization drops
  silently and criterion 4 reaches only the fields an existing test asserts.

- **Three error-handler rows are unverified**, marked as such in the table above. They are small and
  they are the kind of thing that is found by running the suite rather than by reasoning, which is
  the floor this plan stops at.

- **`pino` output is not what anything parses yet.** Nothing consumes these logs, so the format is
  unconstrained today and will be constrained by whatever first reads it, which is out of scope.
