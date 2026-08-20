# @rentable/control-plane

Accounts, workspaces, and membership for a hosted workspace — the middle tier of
[`a-workspace-follows-its-user`](../../.aep/efforts/a-workspace-follows-its-user/spec.md).

**It is in the credential path continuously and in the data path never.** A rents ledger lives
in a workspace database on Turso that offline clients replicate and sync with directly; this
process never reads or writes one. What it will own is who somebody is, which workspaces exist,
who belongs to which, and the short-lived token a client syncs with — so there is no domain
table here, and a schema test fails if one appears.

## What exists today, and what does not

Signing in, the session that sign-in buys, the workspace an account is given at sign-up, minting
the token a client syncs with, and settling that workspace's schema before the token goes out.
**Nothing is deployed.** Whatever reaches this reaches a copy somebody is running, which today
means a local one.

**The desktop cannot open a workspace without it.** That is new: the sign-in wall (#571) and the
removal of the mode discriminator (#566) left no local-only path to fall back to, so a build
whose `RENTABLE_CONTROL_PLANE_URL` is unset reaches no account and shows nothing at all. Setting
it is part of the desktop's setup, in `apps/desktop/.env`.

**Listing the workspaces an account belongs to is still not a route, and the second machine no
longer needs one.** Sign-up creates exactly one workspace (#615) and every reply carries it, so a
machine learns which workspace to replicate from the sign-in it was making anyway. #553, which
this file used to send readers to, was closed as not planned when the mode went.

Removing a member is not a route here yet. **The mechanism is**: the mint reads membership every
time it is asked, so deleting a membership row ends that person's access within one token
lifetime and nobody else's. The administrative surface that does the deleting is a later
ticket's.

## Running it locally

```sh
cp .env.example .env             # then fill in the three Turso values
pnpm db:migrate:control-plane    # from the repository root
pnpm dev                         # from the root: this and the desktop, together
```

`pnpm dev:control-plane` runs this one alone. It listens on `PORT`, 4000 by default, and the
desktop has to be told the same number. `GET /health` queries the database before it answers, so
a process that says `{"status":"ok"}` has reached its own storage rather than merely started.

## The tree

```
migrations/             this database's own, generated and applied by drizzle-kit
src/
├── main.ts             reads the environment, wires the parts, listens
├── sweep.ts            the same wiring, for a command a person runs by hand
├── decline.ts          the same, for ending one account's sessions
├── prune.ts            the same, for removing sign-ins that reached their month
├── failure.ts          the refusal vocabulary — a code, a status, a message
├── account/            who somebody is
│   ├── account.ts      the upsert a sign-in is
│   └── google.ts       verifying an access token against Google
├── database/
│   ├── database.ts     the connection, and the type every module takes
│   └── schema.ts       the four tables
├── server/
│   └── server.ts       routing, and the one place a refusal becomes a status
├── session/
│   └── session.ts      the three-day window: issuing, renewing, declining to renew
└── workspace/          a database on Turso, and who may reach it
    ├── migration.ts    bringing one *workspace* database up to a schema version
    ├── permission.ts   the administration bitfield
    ├── sweep.ts        the same, for every workspace at once, ahead of their users
    ├── turso.ts        the Platform API, the only outbound call this makes
    └── workspace.ts    creating one, and minting the token to sync with it
```

**Three databases are in play and they are not interchangeable.** `migrations/` above is this
process's own — accounts, workspaces, membership. The second is somebody's rents ledger, on Turso,
one database per workspace, whose schema comes from `@rentable/workspace-migrations` and which
this process touches only to apply DDL. The third is a _local_ workspace on somebody's machine,
which this repository still migrates in Rust at launch and which nothing here reaches at all.

Tests are `tests/` under the directory they cover. Two are package-wide and sit in `src/tests/`:
the scaffolding, and the boundary test that reads the whole tree for a domain table or an import
that leaves.

## The routes

**Plain JSON over HTTP.** The desktop's tRPC runs in-process inside the webview with no HTTP
under it, so it is not a precedent for this one, and the only client there will be is the Rust
side — credentials never cross the IPC boundary, so the web layer is not the caller and cannot
become one. tRPC's whole return is inference into a TypeScript client, and there isn't one.

```
GET  /health                    -> {"status":"ok"}
POST /account/sign-in           -> {"account":{...},"session":{"token":"rws_...","expiresAt":0}}
POST /session/refresh           -> {"account":{...},"session":{"token":"rws_...","expiresAt":0}}
POST /workspace                 <- {"name":"..."}   -> 201 {"workspace":{...}}
POST /workspace/{id}/token      <- {"schemaVersion":4}
                                -> {"token":"...","url":"libsql://...","expiresAt":0}
```

**Every route but `/health` takes `Authorization: Bearer <credential>`, and there are two
kinds.** A Google access token is what somebody signs in with; it buys a **session** — a token
this control plane issued, good for three days, and told apart from Google's by its `rws_`
prefix. Either identifies on any route, so a client whose first request is `POST /workspace`
still reaches the account it would have reached.

**Every route hands a session back, and a request carrying a Google access token starts one.** So
a client that keeps presenting its Google token writes a session row per request. _Until #607 this
paragraph claimed the opposite: that two routes issued a session and the others deliberately did
not. It was describing a behaviour nobody wrote, and `server.ts` linked an `askingForASession`
that does not exist._ What actually bounds the growth is the client: the desktop sends its Google token
once at sign-in and `rws_` on every call after it, so a sign-in costs about one row. That is an
assumption about a well-behaved client rather than something this service enforces, and it is
recorded as one in the spec. What accrues anyway is removed by `pnpm prune-sessions`, below.

**The session is what replaced re-verifying with Google on every request** (#550). What that
costs is that a Google token revoked mid-window is not noticed until the session runs out —
the same bound removing somebody already had, and the reason the window is three days rather
than thirty.

### The window, which is requirement 15

**Every route renews the session it was reached with**, so _any connection inside the window
restarts the window_, implemented once rather than remembered at each route. `POST
/session/refresh` exists for the client that is doing nothing else: open, in sync, and with a
window quietly running down.

A client three days out of contact has nothing left to present, and `session_expired` says so
and names the way back. **The window is a lifetime issued here, never a flag the client sets** —
a flag is a window the client can decline to close, and what a client actually needs is minted
on this side.

**Declining to renew is how somebody is removed**, per account and effective at their next
reach. Turso's own revocation is bulk-only and rotates every token in its group with no
published propagation time, which cannot remove one member; this can, within one window. The
administrative surface that decides to is a later ticket's — `declineRenewal` is the mechanism,
and whoever operates this control plane reaches it with a command (#606):

```sh
pnpm --filter ./apps/control-plane decline somebody@example.com
```

It names the account by an address rather than by an id, because that is what an operator holds;
an address naming more than one account is refused, because `account.email` has no unique index
and acting on both would end a stranger's sessions. **It ends sessions and does not bar an
account** — signing in with Google again starts a new one.

A refusal is `{"error":{"code":"...","message":"..."}}`, and **the code is the part a client acts
on** — the message is for a person and names what to do.

| Code                    |          | What the caller does                                              |
| ----------------------- | -------- | ----------------------------------------------------------------- |
| `unauthenticated`       | 401      | No bearer credential was presented. A bug in the caller           |
| `identity_not_verified` | 401      | Google refused the token. Sign in again                           |
| `google_unreachable`    | 503      | The control plane could not ask Google. Retry with the same token |
| `identity_incomplete`   | 502      | Google answered without a subject. A defect, not a stale token    |
| `session_expired`       | 401      | Never issued, run out, or declined. Sign in with Google again     |
| `not_a_member`          | 403      | This account does not belong to that workspace. Nothing to retry  |
| `no_such_workspace`     | 404      | No workspace by that id                                           |
| `client_out_of_date`    | 409      | The workspace is on a newer schema. Update the application        |
| `service_out_of_date`   | 503      | This build has no migration that far. Retry after the next deploy |
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

### A hosted workspace's schema, and where it is settled

**The control-plane API owns a hosted workspace's schema, and the token mint is where it acts**
(decision 06). It is the only party that knows every workspace database, already holds a
credential that reaches each one, and is already in the credential path continuously and the data
path never — so it does not have to be put anywhere new to do the job.

**A client says which schema version it was built against**, in the body of its token request.
There are four answers and three of them are the decision's:

| The client's version           | What happens                                                               |
| ------------------------------ | -------------------------------------------------------------------------- |
| the workspace's                | mint. Nothing is opened and nothing is applied                             |
| **newer** than the workspace's | apply what the workspace is missing, up to the client's version, then mint |
| **older** than the workspace's | **refuse, `client_out_of_date`, and issue no token**                       |
| newer than this build ships    | refuse, `service_out_of_date` — there is nothing to migrate _with_         |

**The ordinary upgrade path is the second row**: the first client to arrive after a deploy pays
for the migration, and it is by definition online. A workspace nobody opens costs nothing, which
is what a sweep over an unbounded and growing set of databases cannot promise.

**Refusing at the mint rather than at the write is the whole of the reasoning.** An older client
allowed to sync would replicate a schema it does not understand and then write against columns it
does not know about; by the time a write failed, its replica would already have diverged, and the
divergence is the thing that would have to be repaired. Withholding the credential stops it
before the first byte — through a mechanism this architecture already has, rather than a second
one built to answer the same question.

**A client never applies migrations to a hosted database, and that is rejected rather than
unbuilt.** Several client versions would race to apply DDL to one database, an old client never
applies, a new one applies while an old one is live, and the DDL then replicates to every other
replica with no coordination. High, and silent.

**The version is derived from the migrations, on both sides, so a build produces it.** It is the
count of `.sql` files in `@rentable/workspace-migrations` — counted here at runtime, and counted
into the desktop binary by `tauri/build.rs`. Nobody bumps a number, and the two counts are the
same number because they count the same files: **there is one copy of the workspace migrations and
it is a package both consumers depend on.**

_This replaced a copy under `apps/control-plane/`, held identical to the desktop's by a test.
Two things were wrong with it. The test was hashed only against this package's own files, so a
commit adding a desktop migration and forgetting the copy would not have run the test that catches
it — green, and then every client refused. And the reason given for the copy was false: this
package's own boundary test banned every `@rentable/` specifier rather than the desktop
application, which was one line here to narrow, and the monorepo effort's spec had already written
the removal condition — "the schema is extracted into its own package the moment a second consumer
exists"._

**A migration that fails leaves that user unable to _sync_**, which is decision 06's named risk
rather than a defect to design away: their local workspace carries on untouched, which is what
makes it survivable. The workspace record is written from the database's own ledger rather than
from what was asked for, so a half-applied set is recorded as where it actually got to and the
next attempt starts from there.

**The hosted database carries the same `__migrations__` ledger a local one carries**, written the
way `apps/desktop/tauri/src/database/migrations.rs` writes it. That identity is load-bearing: a
replica reaches machines whose runner decides what to apply by reading exactly that table, and a
hosted database carrying no ledger would have it start at `0000` and fail on a table that already
exists.

#### The sweep, which is a mechanism and not the owner

```bash
pnpm --filter ./apps/control-plane sweep
```

It takes **every** workspace to the version this build ships. Decision 06 rejected a deploy-time
sweep as the _owner_ — it cannot answer for a workspace created after it ran, it grows without
bound, and a partial sweep leaves the estate at two versions with nothing recording which is
which — and kept it as a mechanism for the case the lazy path cannot serve: **a migration with a
deadline**, where a schema has to be in place by a date rather than by a visit.

Two things follow, and both are deliberate. **It migrates past what a client asked for**, which
the mint will not do, so a workspace it moves refuses older clients until they are updated — that
is what a deadline means. And **one workspace's failure does not end the run**: it finishes, names
what it could not do, and exits non-zero.

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

`pnpm sweep` migrates **every** workspace to the schema version this build ships, which is the
one thing the mint will not do — see below. It is run by a person, never by a deploy.

`pnpm decline <email>` ends one account's sessions, and `pnpm prune-sessions` removes sign-ins
that have reached their month. **All three are invoked and none is scheduled**: nothing is
deployed, so a timer would be a schedule with nowhere to run. Each answers how many rows it
touched, because an operator who cannot tell _nothing was there_ from _something was and is not
now_ has run a command and learned nothing.

The second is `prune-sessions` and not `prune` because `pnpm prune` is one of pnpm's own commands
and would shadow it, running package pruning instead and never reaching the script.

Those three names are this package's own and the root does not alias them, so they want
`pnpm --filter ./apps/control-plane` in front of them from anywhere else. The root carries what
every package here has, which is `dev`, `build` and the `db:` tooling; an operation only this
package can perform is reached where it lives.

`pnpm start` runs it once without the watcher. `pnpm build` emits JavaScript to `build/`;
nothing consumes that yet, and it is there so `turbo run build` proves the package compiles to
something runnable rather than only that it typechecks.

## What it needs to start

Its own database needs a path and nothing else. Provisioning needs three Turso values, and the
process exits without them. `.env.example` is the whole surface:

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

Four tables, in `src/database/schema.ts`, and `src/database/tests/schema.test.ts` is what
holds them to it.

- **`account`** — somebody Google vouched for. Google's `sub` is stored beside the email
  because it survives an email change. The profile is refreshed on every sign-in: Google is the
  record for a person's own name and picture, and a copy taken once goes quietly wrong. **The
  email carries no unique index**, because an address can be reassigned and its next holder is
  a different subject, a different person, and a different row.
- **`workspace`** — a workspace this control plane knows about: the Turso database its data
  lives in, the hostname a client syncs against, and `schema_version` — how far that database has
  been migrated. The version is not null and defaults to `0`, because a workspace database is
  created empty and there is no moment at which "we do not know" is the truth.
- **`membership`** — that an account belongs to a workspace, which grants **full access to
  that workspace's data**. Decision 05: a member's client holds a replica it writes to
  offline, so the only place a per-record rule could be enforced is a server it is by
  definition not talking to.
- **`session`** — a sign-in that is still good, and the three days it has left. The token is
  stored as a **SHA-256 digest and never as itself**: it is a bearer credential, so a readable
  copy of every live one is the worst row this database could carry, and the digest answers the
  only question asked of it. Renewing moves `expires_at` and keeps the token, which is why
  `renewed_at` sits beside `created_at` — the window is measured from the second.

**Foreign keys are declared here and are absent from the workspace schema**, which is a
difference rather than an inconsistency: this database is single and always online, where the
workspace database is replicated to machines that write to it offline.

### The permission ceiling

`permissions` is one `INTEGER` per decision 04, and flags occupy **bits 0–52 only**. The cap is
a test, not a comment: bit 53 pushes the value past 2⁵³, where the _low-order_ bits round away
silently — so a 54th flag would corrupt the first flags ever defined, on every row already
written. When a 54th is genuinely wanted the column becomes a row per granted permission, which
decision 04 records as a migration rather than a rewrite.

`src/workspace/permission.ts` also **sums powers of two where an `OR` would read more
naturally**, and
divides where an `AND` would. JavaScript's bitwise operators coerce to a signed 32-bit integer,
so `1 << 40` is `256` — a ceiling twenty-two bits below the one decision 04 chose, and one it
did not name. A test pins it.
