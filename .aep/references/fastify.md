---
aep: 2.7.0
owner: repository
date: 2026-08-22
kind: reference
use-when: 'adding or changing a control plane route, its validation, its response body, or its logging'
---

# Fastify (the control plane's HTTP surface)

Fastify 5.12.1, and the only HTTP framework in this repository. It holds
`apps/control-plane` and nothing else: the desktop shell is Tauri and the frontend is
SvelteKit, neither of which goes near this.

Built in #746, #747 and #748 from
[[efforts/the-control-plane-declares-what-it-accepts/spec]], which carries the reasoning.
This file carries only what the next person changing a route has to know.

Docs: <https://fastify.dev/docs/latest/>.
Fetch when a hook, a decorator or a schema keyword you need is not below. Never guess a
lifecycle position — the ordering is the thing that bites here, and it is the thing that
looks obvious.

## Where it lives

| File | What it holds |
| --- | --- |
| `server/server.ts` | the instance: options, content type parser, error handler, 404 handler |
| `server/routes.ts` | every route, with its method, its path and its schema. The list is here or it does not exist |
| `server/schema.ts` | request declarations, response declarations, and `WIRE_FIELDS` |
| `server/authenticate.ts` | the auth hook, and why it is the hook it is |
| `server/account.ts`, `workspace.ts`, `health.ts` | handler factories, one per concept |
| `server/wire.ts` | the response objects the handlers build |

## `ControlPlane` is an argument, and never ambient

`controlPlaneServer(plane, { logger })` takes it and every handler is a factory closing over
it. **`decorate` is called nowhere and no plugin is registered**, which is deliberate and is
the constraint under the most pressure, because Fastify's own idiom is the opposite.

It is what lets `server/tests/server.test.ts` run the real routes against a real database
over a real socket. A decorator that made the database reachable from `request.server` would
not fail anything on the day it landed; it would show up later as a test that has to build a
framework instance to test a handler.

## The lifecycle, and the one position that matters

```
onRequest -> preParsing -> parsing -> preValidation -> validation -> preHandler -> handler
```

**Authentication is `onRequest`.** Not `preValidation`, whose name reads as though it were
early enough and is not: parsing happens before it, so a request with no credential and a
body that is not JSON gets 400 from the parser before authentication is ever consulted. The
plan for this effort said `preValidation` and was wrong. Measured 2026-08-22:

| hook | no credential, unparseable body |
| --- | --- |
| `preValidation` | 400 |
| `onRequest` | 401 |

The order is not only about which refusal comes back. `authenticate` creates the account on
a first Google token, provisions its workspace and writes a session row, so validating first
would also stop provisioning an account for a request whose body was malformed.

**One test in the whole suite notices if this drifts** — every other test sends a valid
credential. It sends both faults at once, on both body-taking routes, and it is the only
thing standing between the constraint and a silent regression.

**Attach hooks per route, never to the instance.** A root-level `onRequest` auth hook makes
`/health` demand a credential and answers 401 for a route that does not exist. That reads as
correct in review; the test that catches it is a test for a 404.

## What the framework decides unless you say otherwise

Three defaults that are wrong for this service. All three are set in `server.ts`, and all
three were found by a failing test rather than by reading the documentation.

**`coerceTypes` is on.** Fastify's AJV silently reads `{"name": 7}` as `{"name": "7"}` and
stores the string. Switched off with `ajv: { customOptions: { coerceTypes: false } }`. A
declaration that coerces describes what a caller may be *read as* rather than what they may
*send*.

**An empty body with a JSON content type is refused.** Fastify answers
`FST_ERR_CTP_EMPTY_JSON_BODY`, 400. Sign-in and refresh are called with no body at all, so
every one of those tests would fail. A content type parser answers `{}` instead.

**No media type error is raised.** A body sent without `content-type: application/json` is
not refused as a media type; it is simply never parsed, the route sees `body: undefined`,
and the *declaration* refuses it as a wrong shape. So it is 400 `malformed_request` on the
two routes that declare a body, and 200 on the two that do not. It is not 415, and it is not
uniform across the surface.

## Declaring a response is enforcement, and enforcement cuts both ways

Every route declares what it answers with, and `fast-json-stringify` serializes through the
declaration. A field the declaration does not name **cannot reach the wire** — and a field
removed from a declaration does not error, does not warn, and does not appear. The client
just stops receiving something.

Two things guard that:

- a test that mounts a real schema on a handler written to return undeclared fields
- a test comparing every route's answer against `WIRE_FIELDS` in `schema.ts`

**`WIRE_FIELDS` is written by hand on purpose.** Its first version derived the expected keys
from the declarations, so it compared a thing with itself and passed while a field was being
deleted. Independent by construction is the whole point; deriving it is the mistake that
looks like removing duplication.

The desktop client is Rust and does not regenerate from anything. Changing what a route
answers with costs a deliberate edit to that list, which is the right price.

## Errors

`setErrorHandler` is the only place a failure becomes a response, and no route contains any
handling.

| Arriving as | Answered with |
| --- | --- |
| `Refusal` | its own status and `refusalBody` |
| `error.validation` truthy | `malformed_request`, 400 |
| `FST_ERR_CTP_BODY_TOO_LARGE` | `malformed_request`, 413 |
| anything else | 500, generic text, nothing from the error, logged through `request.log` |

`setNotFoundHandler` answers `no_such_route`, because Fastify's default 404 carries its own
shape and the shape is a contract like any other.

**The refusal code is the contract; the message is not.** `sync/control.rs:388` says so in
its own doc comment. Messages may be reworded; codes and statuses may not.

## Logging

The instance's `pino` stamps `reqId` on every line a request emits, which is the whole of
how concurrent requests are told apart. **Log through `request.log`, not the instance's
logger** — that one word is what joins a failure line to the request that produced it.

`controlPlaneServer` takes the logger as its second argument so a test can pass a sink and
assert on lines. Reaching for a logger instead of being passed one would be the first
ambient dependency in this package.

Commands (`sweep`, `decline`, `prune`) log through `logging.ts` at the package root, with no
request identifier, because a command has no request. `pino` writes synchronously to stdout,
so a line written immediately before `process.exit` still arrives — checked, because that is
a real way to silently break a command someone runs at a terminal.

## Verification

```bash
pnpm --filter @rentable/control-plane test
```

155 tests, 149 passing, 6 skipped, across the package. 46 of them are
`server/tests/server.test.ts`, and those start a real instance on port 0 and talk to it with
`fetch`; `inject()` is deliberately not used, because the transport is half of what those
tests exist to cover.

The suite takes around four minutes and each end to end test costs about five seconds, which
is the price of the real socket and the real database. A run that dies with exit code
`3221225477` and no `test-exit-reason.log` is [#719](https://github.com/saud-alnasser/rentable/issues/719),
not your change; re-run it.
