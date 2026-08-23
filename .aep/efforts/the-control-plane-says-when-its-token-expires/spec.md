---
aep: 2.7.0
owner: repository
date: 2026-08-23
kind: spec
status: accepted
---

# Problem

**The credential the control plane reads its own records with dies on 2027-08-22, and nothing
in the process knows that.** Both hosted databases were created on 2026-08-23 with tokens minted
`expiration=52w`, which [[references/turso]] records as exactly 31449600 seconds. Neither token
is read for anything but being handed to `@libsql/client`.

What that costs is worst on the day it matters. When the token expires, every query the control
plane makes is rejected by the remote, and the only thing a person sees is `/health` answering
503 — a route that deliberately keeps the reason out of its body, because a caller asking about
a workspace should not be told about a database. So the failure arrives with no cause attached,
on a service where every route is in the credential path: nobody can sign in, nobody can open a
workspace, and the log says the database is unreachable.

**There is no warning either.** The startup line already announces which database this process
opened —

```
control plane listening on http://localhost:4000, database hosted libsql://control-plane-....turso.io
```

— and that line is where somebody would look. It says where the records are and nothing about
how long the process may keep reading them. `resolveDatabase` refuses four configurations that
cannot work, and a token past its expiry is a fifth that it accepts without a word.

The one asymmetry that shapes everything below: **`exp` in the past is near-certain failure,
`exp` in the future proves nothing.** The claim is read from an unverified JWT, and this account's
tokens can also be revoked in bulk with no propagation time published, so a live `exp` is not a
promise that a query will work. Only the deadline is knowable, and only the deadline is claimed.

# Goal

Every entrypoint that opens a hosted database says, on the line it already prints, when that
database's token expires and how long is left. A token already past its expiry says so in words
that name the consequence. A local `file:` database, which has no token, says exactly what it
says today.

# Scope

`apps/control-plane/src/database/database.ts` and the tests over it. The announcement is built
by `describe()`, which all four entrypoints already print, so the four call sites are read to
confirm they inherit it rather than being edited.

`.env.example` and the README where they describe the token, and [[references/turso]] where it
records the mint.

# Requirements

1. **A hosted database's announcement carries the token's expiry date and the time remaining.**
2. **A token already past its expiry is announced as expired, and the announcement names the
   consequence** — that every query will fail — rather than leaving a reader to infer it from a
   negative number.
3. **A token whose expiry cannot be read is announced as unreadable, and the process still
   starts.** A token that is not a JWT, carries no `exp`, or carries one that is not a number is
   this case. Turso mints JWTs today; a token that does not parse is a fact about the token, not
   grounds to refuse a database that may work perfectly.
4. **An expired or unreadable token never refuses at startup.** The four existing refusals in
   `resolveDatabase` stand exactly as they are and gain no fifth.
5. **The announcement is one line at one level, whatever the number is.** No threshold, no
   escalation, no second line.
6. **Nothing prints the token.** The announcement is built from the `exp` claim and from nothing
   else, and no branch of it — including the unreadable one — echoes any part of the credential.
7. **A local `file:` database's announcement is unchanged**, byte for byte.
8. **The time source is an argument.** Whatever reads the deadline takes its clock rather than
   reaching for `Date.now()`, so the tests state a date instead of computing one.

# Acceptance Criteria

1. A test builds a hosted configuration whose token carries a known `exp`, states a clock before
   it, and asserts the announcement contains both the expiry date and the remaining time.
2. A test states a clock past that same `exp` and asserts the announcement says the token is
   expired and says that queries will fail.
3. Three tests cover the unreadable token — not a JWT, a JWT with no `exp`, a JWT whose `exp` is
   not a number — and each asserts the announcement says the expiry could not be read, and that
   `resolveDatabase` still returns a configuration for the same environment.
4. A test asserts that `resolveDatabase` refuses exactly the four configurations it refuses
   today, for the same reasons, with an expired token present in the environment for the accepted
   case.
5. A test asserts that no announcement in criteria 1 to 3 contains the token, any segment of it,
   or any substring of it longer than a few characters.
6. A test asserts a `file:` configuration's announcement is exactly `local file <path>`, the
   string the current tests already pin.
7. Running `main.ts` against the real hosted database prints one line carrying both the host and
   the expiry, and running one of `sweep`, `decline` or `prune-sessions` prints the same expiry on
   its own line, showing the four entrypoints inherited it without being edited.
8. `.env.example` and the README say that the token expires and that the startup line is where the
   deadline is read; [[references/turso]] carries the same date it already records, pointed at
   this behaviour.

# Constraints

- **`describe()` stays pure and stays the only builder of the announcement.** It is what makes
  criteria 1 through 6 testable without a process, and it is why all four entrypoints get this
  without four edits. A second place that formats a database line would drift from it.
- **The `exp` claim is read, never verified.** There is no key here and no JWT library in the
  package, and adding one to read a number out of a base64url segment would be a dependency
  bought for a decode.
- **No new refusal.** Requirement 4 is a constraint as much as a requirement: `resolveDatabase`'s
  refusals are what four acceptance criteria of
  [[efforts/the-control-plane-keeps-its-records-on-turso/spec]] pinned, and a fifth that fires on
  a local clock would put the service at the mercy of a machine's time being right.
- **The suite still needs no network, no account, and no token.** Every criterion above except 7
  is met by a token built in the test file.

# Out of Scope

- **Rotating, re-minting, or renewing the token.** [[efforts/the-control-plane-keeps-its-records-on-turso/spec]]
  puts rotation out of scope and gives it to whichever effort stands the process up. Nothing here
  changes that. This effort says when the deadline is; it does not move it.
- **Anywhere for secrets to live other than `.env`.** Same exclusion, same owner.
- **Alerting, paging, or anything that watches the log.** Requirement 5 settles the log's shape
  deliberately so that something outside the process can be built on it later, and building that
  something is not this.
- **A threshold, a warning level, or a second line as the deadline closes.** Considered and
  declined on 2026-08-23: one line at one level all year has nothing to tune, and a threshold is
  cheap to add the day somebody wants to be nudged. Recorded so it is not re-proposed as an
  oversight.
- **The health route's body.** It keeps the reason out on purpose. This effort makes the cause
  readable in the log, which is where an operator looks, and leaves the route alone.
- **Workspace tokens.** `workspace/turso.ts` mints three-day credentials for clients, and a client
  that holds an expired one renews. Nothing about them changes.
- **Anything that reads `exp` to decide behaviour rather than to report it.** No early refresh, no
  refusal, no retry policy keyed on the deadline.

# Assumptions

- **Turso's database tokens are JWTs whose payload carries a numeric `exp`.**
  [[references/turso]] records `exp - iat` read off tokens on 2026-08-18 and again on 2026-08-23,
  so the claim is present on this account's tokens today. Requirement 3 exists because that is a
  measurement rather than a contract, and a token that stops being a JWT must not stop the process.
- **The token in `CONTROL_PLANE_DATABASE_TOKEN` is the one the client presents.** It is passed
  straight to `createClient`, so the `exp` read here is the deadline that applies.

# Open Questions

None material. The two that were — whether an expired token refuses, and whether the line
escalates as the deadline closes — were put to the human on 2026-08-23 and settled as
requirements 4 and 5.

# Risks

- **A live `exp` reads as reassurance it has not earned.** Revocation on this account is bulk-only
  with no published propagation time, so a token can die long before its deadline while the
  startup line still counts down. The wording of requirement 1 is what carries this: it says when
  the token expires, never that the token works.
- **The remaining time is computed from this machine's clock.** A skewed clock misreports the
  number. It cannot stop the process, which is requirement 4, so the cost is a wrong line rather
  than an outage.
- **A `describe()` that now takes a clock is a signature change on a function four entrypoints
  call.** The compiler catches every call site, and criterion 7 is what proves the four still
  print.

# Architecture

**A third pure function beside the two that exist.** `resolveDatabase` decides whether a
configuration can work, `describe` builds the sentence a process prints, and `tokenExpiry` reads
the deadline out of a token. Each keeps one job, and the one that grows is the sentence.

```
resolveDatabase(env)        -> Resolution              unchanged
tokenExpiry(token, now)     -> Expiry                  new
describe(configuration, now) -> string                 gains a clock, calls tokenExpiry
```

`Expiry` is a discriminated union of the three outcomes requirements 1 to 3 name, so the
formatting has no fourth case to invent and the compiler says so:

```ts
type Expiry =
  | { standing: 'live'; expiresAt: number; remainingMs: number }
  | { standing: 'expired'; expiresAt: number }
  | { standing: 'unreadable' };
```

**Two placements lost, and neither is unreasonable.**

| | Advantages | Disadvantages | Risks | Maintenance |
| --- | --- | --- | --- | --- |
| **Its own function** (chosen) | the decode is tested without going through line formatting; `resolveDatabase` never sees `exp`, so requirement 4 holds by construction | one more name in a small module | none identified | the two parses move independently |
| Decode in `resolveDatabase`, carried on the configuration | the value sits where the environment is already read, and anything later that wanted to *act* on the deadline would find it there | gives the resolver a job that is not deciding whether the configuration can work, and puts a field on `DatabaseConfiguration` that exists only for a log line | a resolver that reads `exp` is one edit away from refusing on it, which requirement 4 forbids and a later reader would not know | the type grows for a reason its name does not carry |
| Decode inside `describe` | smallest diff, no new name | one function performing two unrelated parses; the decode is only reachable through the formatted string | a test that pins the sentence is the only thing pinning the decode | the two parses cannot move apart |

The chosen one is the only one under which requirement 4 is a property of the code rather than a
promise. That is the whole reasoning: the effort's most load-bearing constraint is *no fifth
refusal*, and the resolver not being handed the material is stronger than the resolver being
trusted with it.

# Interfaces

`describe`'s signature changes, which is the one breaking edge:

```ts
export const describe = (configuration: DatabaseConfiguration, now?: () => number): string
```

**`now` is optional and defaults to `Date.now`**, matching `ControlPlane.now` in `server/server.ts`,
which is this package's existing spelling for an injected clock. Optional is what keeps the four
entrypoints and `hosted.test.ts` compiling untouched, which is what criterion 7 then observes
rather than arranges.

`tokenExpiry` takes the token and the same clock:

```ts
export const tokenExpiry = (authToken: string, now: () => number): Expiry
```

It is exported for its own tests. Nothing outside `database.ts` calls it.

# Technical Approach

**The decode.** A JWT is three base64url segments separated by dots. The middle one is the
payload. `Buffer.from(segment, 'base64url')` and `JSON.parse` are the whole operation; anything
that throws, any segment count other than three, a payload that is not an object, and an `exp`
that is not a finite number all return `{ standing: 'unreadable' }`. `exp` is seconds since the
epoch by RFC 7519, so it is multiplied by 1000 before it meets a millisecond clock — the one unit
error this change can make, and the tests state a date to catch it.

**The sentence.** The hosted branch of `describe` appends to what it already builds. The three
shapes, formatted from the `exp` claim and nothing else:

```
hosted libsql://control-plane-....turso.io, token expires 2027-08-22 (364 days left)
hosted libsql://control-plane-....turso.io, token EXPIRED 2027-08-22 (every query will fail)
hosted libsql://control-plane-....turso.io, token expiry unreadable
```

The date is `toISOString().slice(0, 10)` — UTC, unambiguous, and the same spelling
[[references/turso]] records dates in. Remaining time is rendered in days down to one day and in
hours below that, because a line reading `0 days left` is the one that most needs to be readable.

**The local branch is not touched.** Requirement 7 is met by the `file:` path returning before any
of this, exactly as it does today.

# Testing Strategy

`src/database/tests/database.test.ts`, which already covers `resolveDatabase` and `describe`
directly because both are pure. A token is built in the file rather than mocked:

```ts
const tokenExpiringAt = (seconds: number) =>
  `${header}.${Buffer.from(JSON.stringify({ exp: seconds })).toString('base64url')}.${signature}`;
```

The signature segment is never verified and never read, so it is a constant string.

| Criterion | How |
| --- | --- |
| 1 | a token at a known `exp`, a clock 364 days before it, assert the date and the remaining days |
| 2 | the same token, a clock past it, assert `EXPIRED` and the consequence |
| 3 | three tokens — not a JWT, no `exp`, `exp: "soon"` — assert `unreadable`, and assert `resolveDatabase` still configures |
| 4 | the existing refusal tests stand; one gains an expired token in the environment and still expects a configuration |
| 5 | assert the announcement contains neither the whole token nor its payload segment |
| 6 | the existing `local file ./control-plane.db` assertion, unchanged and untouched |
| 7 | run `main.ts` and one command against the real hosted database, quote both lines |
| 8 | the diff to `.env.example`, the README, and [[references/turso]] |

Criteria 1 to 6 need no network, no account and no token, which is the constraint. Criterion 7 is
the only live one and it reads rather than writes: it starts a process, prints a line, and stops.
Nothing is created on the account, so it does not carry the standing rule that a live create does.

# Operational Considerations

The line is what an operator reads on the day the 503s start, and it is the reason this effort
exists. It changes the startup output of all four entrypoints, so anything grepping those lines
sees a longer string. Nothing does today.

# Technical Risks

- **The seconds-to-milliseconds conversion.** Getting it backwards yields a deadline in 1970 or in
  56000 AD, both of which a test stating a real date catches immediately, which is why the tests
  state one.
- **`describe` gaining a parameter.** Optional with a default, so no call site is edited and none
  can be missed; the compiler covers the rest.
