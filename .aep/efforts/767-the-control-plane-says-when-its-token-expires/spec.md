---
status: implemented
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
