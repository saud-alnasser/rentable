# @rentable/control-plane

Accounts, workspaces, and membership for a hosted workspace — the middle tier of
[`a-workspace-follows-its-user`](../../.aep/efforts/a-workspace-follows-its-user/spec.md).

**It is in the credential path continuously and in the data path never.** A rents ledger lives
in a workspace database on Turso that offline clients replicate and sync with directly; this
process never reads or writes one. What it will own is who somebody is, which workspaces exist,
who belongs to which, and the short-lived token a client syncs with — so there is no domain
table here, and a schema test fails if one appears.

## What exists today, and what does not

Signing in, creating a workspace, and minting the token a client syncs with. **Nothing is
deployed, and nothing on the desktop calls any of it** — a local-only workspace reaches no
account, and the occasion to reach this arrives with the mode choice rather than with signing in
to Google.

|                                                                     |      |
| ------------------------------------------------------------------- | ---- |
| settling a hosted workspace's schema at the mint                    | #557 |
| the desktop choosing to be hosted, which is what first calls this   | #553 |
| listing the workspaces an account belongs to, which machine B needs | #558 |

Removing a member is not a route here yet. **The mechanism is**: the mint reads membership every
time it is asked, so deleting a membership row ends that person's access within one token
lifetime and nobody else's. The administrative surface that does the deleting is a later
ticket's.

## The routes

**Plain JSON over HTTP.** The desktop's tRPC runs in-process inside the webview with no HTTP
under it, so it is not a precedent for this one, and the only client there will be is the Rust
side — credentials never cross the IPC boundary, so the web layer is not the caller and cannot
become one. tRPC's whole return is inference into a TypeScript client, and there isn't one.

```
GET  /health                    -> {"status":"ok"}
POST /account/sign-in           -> {"account":{...}}
POST /workspace                 <- {"name":"..."}   -> 201 {"workspace":{...}}
POST /workspace/{id}/token      -> {"token":"...","url":"libsql://...","expiresAt":0}
```

**Every route but `/health` takes `Authorization: Bearer <google access token>`.** There is no
session token — one is #550's, and this is the thing it will replace — so identity is
re-established from Google on each request. It costs one round trip, and it is what _the API is
in the credential path continuously_ actually means. Signing in is not a precondition for the
other routes either: they perform it, so a client whose first request is `POST /workspace`
reaches the account it would have reached.

A refusal is `{"error":{"code":"...","message":"..."}}`, and **the code is the part a client acts
on** — the message is for a person and names what to do.

| Code                    |          | What the caller does                                              |
| ----------------------- | -------- | ----------------------------------------------------------------- |
| `unauthenticated`       | 401      | No bearer credential was presented. A bug in the caller           |
| `identity_not_verified` | 401      | Google refused the token. Sign in again                           |
| `google_unreachable`    | 503      | The control plane could not ask Google. Retry with the same token |
| `identity_incomplete`   | 502      | Google answered without a subject. A defect, not a stale token    |
| `not_a_member`          | 403      | This account does not belong to that workspace. Nothing to retry  |
| `no_such_workspace`     | 404      | No workspace by that id                                           |
| `workspace_unavailable` | 503      | Turso could not be reached or would not answer. Retry             |
| `malformed_request`     | 400, 413 | Fix the caller                                                    |
| `unavailable`           | 500      | Something failed here, and the caller is told nothing more        |

### A workspace, and the token to sync with it

Creating a workspace creates a **database of its own on Turso**, named `ws-<workspace id>`, then
the record naming it and the owner's membership, as one transaction. The database is created
first and **removed again if that transaction cannot be written** — the other order leaves a
workspace naming no database, which every reader would then carry for a state only a crash
produces.

**That removal is best-effort and is known to fail on some accounts.** Turso refuses to delete
any database inside a group with delete protection on, answering about the group rather than
about what was asked. Where the group is configured that way, an interrupted creation leaves a
database behind and says so in the log. [`references/turso`](../../.aep/references/turso.md) has
the measurement.

`POST /workspace/{id}/token` mints a Turso token **scoped to that one database** and good for
**three days**, alongside the `libsql://` URL to use it against. Three days is not a tuning
choice: requirement 15 is that a signed-in client survives three days without a connection and
that any connection inside the window renews it, and the window _is_ the expiry — implemented as
a client-side flag it would be a window the client can decline to close.

**Membership is read on every mint**, which is what makes removing somebody work. Turso's own
revocation is bulk-only and rotates every token in the group with no published propagation time,
so it cannot remove one person; declining to renew can, per-user, within one token lifetime.

`full-access` is the only authorization asked for. Decision 01 found the Platform API's mint
exposes nothing finer, and decision 05 settled that membership grants full access to a
workspace's data anyway — a disconnected client writes to a replica, so a narrower token would be
a promise enforced by a server it is not talking to.

### How a sign-in is verified

The access token is presented to Google's UserInfo endpoint as a bearer credential, and the
identity is read out of Google's answer. **The call is the verification**: an access token is
opaque, so asking the issuer is the only way to learn who it belongs to — and the only way to
learn it is still live, which a signature check on a self-contained ID token would not have
noticed until the token expired.

**Accounts are matched on Google's `sub`, never on the email address**, which is what makes an
email change harmless. `sub` is OpenID Connect's, so the desktop asks for the `openid` scope;
without it the grant is plain OAuth 2 and `sub` is undefined rather than promised. **It is not
the desktop's `providerUserId`** — that is Drive's `permissionId`, the same person under a
different scheme, and copying one into the other would make one person two accounts.

## Run it

```bash
pnpm --filter ./apps/control-plane db:migrate   # create the database, or bring it up to date
pnpm --filter ./apps/control-plane dev          # start it, reloading on a change
```

Then `curl http://localhost:4000/health`, which answers `{"status":"ok"}` only after reaching
the database — a process that started without one is the thing a health check exists to
disprove. It does not say _which_ database: the URL goes to stdout at startup, where the person
running it can see it and a caller cannot.

`pnpm start` runs it once without the watcher. `pnpm build` emits JavaScript to `build/`;
nothing consumes that yet, and it is there so `turbo run build` proves the package compiles to
something runnable rather than only that it typechecks.

## What it needs to start

Nothing, against a local database. `.env.example` is the whole surface:

| Variable                       | Default                   |                                                          |
| ------------------------------ | ------------------------- | -------------------------------------------------------- |
| `CONTROL_PLANE_DATABASE_URL`   | `file:./control-plane.db` | a local file, or a `libsql://` URL once this is deployed |
| `CONTROL_PLANE_DATABASE_TOKEN` | unset                     | only for a hosted database                               |
| `PORT`                         | `4000`                    |                                                          |
| `TURSO_API_TOKEN`              | **required**              | a _Platform API_ token, not a database token             |
| `TURSO_ORG`                    | **required**              | the organization slug                                    |
| `TURSO_GROUP`                  | **required**              | an existing group the workspace databases are created in |

The three Turso variables are checked at startup and the process **exits rather than starting
without them**. A control plane that cannot provision looks healthy, answers `/health`, signs
people in, and then fails the one route it exists for — at which point the failure reads as Turso
being down.

**Both URLs go through the same libSQL client**, which is why it is here rather than the
`better-sqlite3` the desktop tests run on: deploying is out of scope for this effort, and
choosing a client that would have to be replaced to deploy is not the same as deferring it.

## The schema

Three tables, in `src/schema.ts`, and `src/tests/schema.test.ts` is what holds them to it.

- **`account`** — somebody Google vouched for. Google's `sub` is stored beside the email
  because it survives an email change. The profile is refreshed on every sign-in: Google is the
  record for a person's own name and picture, and a copy taken once goes quietly wrong. **The
  email carries no unique index**, because an address can be reassigned and its next holder is
  a different subject, a different person, and a different row.
- **`workspace`** — a workspace this control plane knows about. Where its data actually lives
  is #556's column and the schema version it carries is #557's; neither is here yet, because a
  column null on every row documents nothing.
- **`membership`** — that an account belongs to a workspace, which grants **full access to
  that workspace's data**. Decision 05: a member's client holds a replica it writes to
  offline, so the only place a per-record rule could be enforced is a server it is by
  definition not talking to.

**Foreign keys are declared here and are absent from the workspace schema**, which is a
difference rather than an inconsistency: this database is single and always online, where the
workspace database is replicated to machines that write to it offline.

### The permission ceiling

`permissions` is one `INTEGER` per decision 04, and flags occupy **bits 0–52 only**. The cap is
a test, not a comment: bit 53 pushes the value past 2⁵³, where the _low-order_ bits round away
silently — so a 54th flag would corrupt the first flags ever defined, on every row already
written. When a 54th is genuinely wanted the column becomes a row per granted permission, which
decision 04 records as a migration rather than a rewrite.

`src/permission.ts` also **sums powers of two where an `OR` would read more naturally**, and
divides where an `AND` would. JavaScript's bitwise operators coerce to a signed 32-bit integer,
so `1 << 40` is `256` — a ceiling twenty-two bits below the one decision 04 chose, and one it
did not name. A test pins it.
