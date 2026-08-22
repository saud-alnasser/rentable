---
aep: 2.7.0
owner: repository
date: 2026-08-22
kind: prototype
---

# Prototype — Fastify under `tsx` and `node:test`

Run on 2026-08-22, during `/aep:plan`, to settle the spec's one unverified assumption before an
approach was written against it. The spec said of it: *if it is wrong the approach changes rather
than bends*.

**Versions as measured**, not as declared: Fastify `5.12.1`, Node `v24.18.0`, `tsx` `4.23.1`,
Windows 11. Installed with `pnpm --filter @rentable/control-plane add fastify`.

The prototype was one throwaway `node:test` file, six tests, built against the real
`src/failure.ts` rather than a stand-in, so the `Refusal` class and the real refusal codes were
the ones under test. It has been deleted; this file is the record.

## What was asked, and what came back

| # | Question | Answer |
| --- | --- | --- |
| 1 | Does Fastify 5 import and run under `node --import tsx --test`, from `.ts` sources? | **Yes.** No loader configuration, no build step, no `.js` extension games |
| 2 | Is it startable on port 0 and reachable by `fetch`, the way `runningControlPlane` is? | **Yes.** `app.listen({ port: 0 })`, then `app.server.address().port` |
| 3 | **Can authentication be made to run before schema validation?** | **Yes, and this was the crux** |
| 4 | Does response serialization drop a field the declaration does not name? | **Yes** |
| 5 | Can one error handler map a `Refusal`, a validation failure, and anything else? | **Yes** |
| 6 | Does a body limit produce a refusal? | **413, in Fastify's own shape.** See the caveat below |

## The crux, in detail

Requirement 2's ordering constraint is expressible **without fighting the framework**, which was
the open worry. Fastify runs `preValidation` hooks before it validates the body. Measured:

```
no credential + malformed body ->  401 {"error":{"code":"unauthenticated",   ...}}
   credential + malformed body ->  400 {"error":{"code":"malformed_request", ...}}
```

That is exactly what `server.ts` does today and exactly what criterion 2a demands. The hook is
`preValidation`, and the distinction from `preHandler` is the whole of it: `preHandler` runs
*after* validation and would produce the wrong answer while looking equally reasonable in a diff.

A validation failure arrives at `setErrorHandler` with a truthy `error.validation`, which is what
makes the mapping onto `MALFORMED` possible. Fastify's own message text is discardable, which the
spec's second constraint already permits.

## The finding nobody asked for, and it is the useful one

**A `preValidation` hook registered on the root instance applies to every route, including the
ones that must not require a credential.** The prototype's first test asked for an unknown path
expecting 404 and got **401**, because the global auth hook fired before routing resolved to
nothing. `/health` would answer 401 the same way.

This is the only test of the six that failed, and it failed because the prototype was written the
obvious way. That is the point of having run it. **Authentication has to be scoped** rather than
registered globally: an encapsulated plugin holding the four authenticated routes, with `/health`
outside it, or the hook declared per route.

Recorded here rather than only in the spec because it is the kind of thing that reads as correct
in review. A global hook is one line, it is what most Fastify examples show, and the test that
catches it is a test for a 404.

## Caveat on question 6

The body-limit test used a bare instance with **no** error handler registered, so it establishes
that `bodyLimit` yields 413 and establishes nothing about the body shape. As measured the 413
carried Fastify's own shape, `{"statusCode":413,"code":"FST_ERR_CTP_BODY_TOO_LARGE",...}`, not
this repository's `{"error":{"code":...}}`.

**So this is not settled**: whether a framework error routed through `setErrorHandler` can be
normalised into the repository's refusal shape was not tested, and today `MAXIMUM_BODY_BYTES` in
`readJsonBody` produces a `Refusal`. It is small, and it is a real gap rather than a pass.

## What this does not establish

- Nothing about the 40 existing tests. No route was ported.
- Nothing about `ControlPlane` under load or across a plugin boundary. The prototype passed a
  one-field object through a closure and read it back out of a response, which shows the argument
  path works and shows nothing about whether it survives contact with encapsulation.
- Nothing about logging, request identifiers, or the three commands.
- Nothing about `pnpm check`. The prototype was run with `tsx`, not `tsc`.
