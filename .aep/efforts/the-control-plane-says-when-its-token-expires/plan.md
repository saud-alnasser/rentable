---
use-when: "building a ticket in this effort and the approach to the control plane's token expiry is not obvious from the spec"
---

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
