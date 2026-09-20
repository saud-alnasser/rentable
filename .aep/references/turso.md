---
use-when: 'provisioning a workspace database, minting a token to sync with one, or reading what the desktop does to Turso'
---

# Turso — the Platform API

**This file is yours.** It records how Turso is actually reached from
`apps/desktop/tauri/src/sync/turso/` and `packages/turso-platform/`; correct it where the
repository differs rather than deferring to what the documentation says. *It recorded the
control plane's use until that retired on 2026-09-12.*

Docs: <https://docs.turso.tech/api-reference>
Fetch the docs when a call you need is not listed below. **Never guess an endpoint or a
parameter name** — the response fields are Go struct names showing through and are not what a
JSON API usually looks like.

## Purpose

Two things, and neither is in the data path: **creating the database a workspace's data lives
in**, and **minting the short-lived token a client syncs with**. Reads and writes go
between a client's replica and its database directly; this API never sees a row of anybody's
ledger.

**The organization's own directory is on Turso as well, and it does not come through this API
either.** `org-<id>` is an ordinary database every member's machine keeps a replica of; all this
API did for it was create it once, and everything after that is the sync engine's. *The control
plane's own records, `control-plane` and `control-plane-live-test`, are still on the human's
account and are theirs; the application that read them retired on 2026-09-12.*

**What this API does to `org-<id>` widened on 2026-09-16, with effort 828, so "all this API did
for it was create it once" no longer holds.** Two of that effort's requirements reach the
directory. Requirement 14 connects a machine to an organization the group already holds, and
`setup::connect_existing` mints a token over `org-<id>` on this API for the machine that is
joining, the way a first run mints one over the database it just created. Requirement 18 lets the
owner delete the organization, and `removal::delete_organization` removes `org-<id>` through
`delete_database` after every `ws-` database the directory names. So the API creates the directory,
mints over it and deletes it; the reads and writes in between are still the sync engine's, which is
the part of the sentence that stands. *Never run* carries the delete as the third deletion reason.

## Prerequisites

In the shipping application, one thing: **a consent**. The owner grants the application authority
over a group of their own account in the browser, the token is filed in the keyring, and the
organization slug is discovered once through the MCP server (`sync/turso/discovery.rs`). Nothing
is typed and no environment variable is read.

The live tests read three values from the environment instead, because they have no browser:

| | |
| --- | --- |
| `TURSO_CONSENT_TOKEN` | the Platform API token a consent produced, read out of the keyring for the run |
| `TURSO_ORG` | the organization slug the paths are built from |
| `TURSO_GROUP` | an existing group the databases are created in |

`apps/desktop/.env.example` is where they are named, beside `RENTABLE_LIVE_TURSO=1`, which arms
the run. The older `losing_writer` tests read `TURSO_API_TOKEN` under that name. **The token is the
human's to rotate: do not print it, do not commit it, and do not assume it is the one production
uses.**

## Commands

There is no CLI in this repository's path. Everything is HTTP, against `https://api.turso.tech`,
with `Authorization: Bearer <TURSO_API_TOKEN>`.

**Three callers, and one of them ships.** **`apps/desktop/tauri/src/sync/turso/platform.rs` is the
one that ships, since 2026-09-11 and effort 819**: the control plane's client ported into the
desktop with its port shape intact, spending a token a browser consent filed in the keyring, and
reaching the customer's own account rather than ours. `packages/turso-platform/index.ts` is that
client in TypeScript, kept for a hosted tier and imported by nothing; the endpoints below were
first documented for it while it was `apps/control-plane/src/workspace/turso.ts`.
`apps/desktop/tauri/src/database/test/workspace.rs` is the third, added 2026-08-20 by #552: it
provisions and destroys a database per test so that two replicas have something to diverge against,
and it is `#[cfg(test)]` and `#[ignore]`d ([[rules/testing]], under *Tests that reach a live
remote*, is what bounds it). The Rust port is the first thing in the shipping desktop binary to
reach this API. It adds the configuration call below to the three `turso.ts` makes, and its
deletion is behind a caller-stated intent rather than a method that merely exists.

```
POST   /v1/organizations/{org}/databases
       {"name": "ws-<workspace id>", "group": "<TURSO_GROUP>"}

POST   /v1/organizations/{org}/databases/{database}/auth/tokens?expiration=3d&authorization=full-access

DELETE /v1/organizations/{org}/databases/{database}

PATCH  /v1/organizations/{org}/databases/{database}/configuration
       {"delete_protection": true}          desktop only; on at create, lifted before a delete
GET    /v1/organizations/{org}/databases/{database}/configuration
```

`expiration` takes Turso's own duration spelling — `2w1d30m` — and defaults to `never`, which
is never what this repository wants. `authorization` is `full-access` or `read-only` and
nothing finer; decision 01 found the fine-grained flags the CLI documents are not on this
endpoint.

## Expected output

```json
{ "database": { "DbId": "…", "Hostname": "ws-….turso.io", "Name": "ws-…" } }
{ "jwt": "…" }
{ "database": "ws-…" }
```

**`Hostname` has a capital H**, and so do the other two. Both clients read either spelling,
because a change to it would be a silent total failure of the one route that creates a
workspace.

The hostname carries no scheme. `libsql://` is prepended where it is used — that URL and the
`libsql://` the sync client takes are the same string, confirmed by the decision 11 prototype.

## Verification

`packages/turso-platform/tests/platform.test.ts` runs the TypeScript client against a fake `fetch`
and pins the path, the credential, the query parameters and the shape read back; the Rust port's
tests in `sync/turso/platform.rs` do the same against a scripted server.

**Run live against this account 2026-08-18, at the human's request**, creating one database,
minting a token for it, and attempting to delete it. What it settled:

| | |
| --- | --- |
| `Hostname` really is capitalised | the client read it |
| the hostname carries the org slug | `ws-<uuid>-<org>.aws-eu-west-1.turso.io` |
| a `ws-<uuid>` name is 39 characters | comfortably inside the 64 cap |
| `expiration=3d` gives exactly three days | the token's `exp - iat` is 259200 |
| the token is scoped to one database | its `id` claim is that database's id |
| **a delete-protected group refuses to delete its databases** | see below — this one was a surprise |

**Run live again 2026-08-20, at the human's request, and it settled the dialect question.** The
whole shipped migration set — `0000` through `0003_serious_synch.sql`, identity rewrite included —
applies to a Turso database through `migration.ts`'s own runner, and the schema it leaves has `TEXT`
keys throughout and no `idmap`. #557's criterion 5 was recorded as *documented, not exercised end to
end* for want of exactly this, and the control plane's `provisioning.test.ts` was what exercised
it until the retirement; the desktop's `workspace_live` test applies the same set over the wire
now.

**Run live a third time 2026-08-23, at the human's request, and this one was not about a
workspace.** It created the two databases the control plane's own records live in, minted a token
for each, applied the migrations to one and served from it, and ran
`apps/control-plane/src/database/tests/hosted.test.ts` against the other. #757 is the ticket.

| | |
| --- | --- |
| `control-plane` | what the control plane serves from. Group `rentable`, created 2026-08-23 |
| `control-plane-live-test` | what the live test writes into. Same group, same day |

Neither is a `ws-` database and neither is a workspace. The names say so plainly, so that nobody
reading the dashboard has to work it out from the group. What the run settled:

| | |
| --- | --- |
| `expiration=52w` is accepted | the token's `exp - iat` is 31449600, exactly 364 days |
| a token for a database that is not a workspace is scoped like one | its `id` claim is that database's `DbId` |
| the migrations apply over the wire | every table in the schema, and seven `__drizzle_migrations` rows against seven `.sql` files |
| the process serves from it | `/health` answered `{"status":"ok"}` |
| a remote honours an interactive transaction | a `db.transaction()` that throws leaves none of its writes |

**Three of those were assumptions the effort was built on**, and this run is where each stops being
one: drizzle-kit's `turso` dialect carrying migrations to a remote, a token for a database that is
not a `ws-` workspace being scoped the way the workspace tokens are, and a remote honouring an
interactive transaction. Until this run the last was read off `drizzle-orm` 0.45.2's source
rather than observed. [[references/drizzle-kit]] carries the migrate.

Nothing here had tried an expiration as long as `52w` before; every example had stopped at
`2w1d30m`. The startup line read `database hosted
libsql://control-plane-saud-alnasser.aws-eu-west-1.turso.io`, which is the scheme and the host with
no token and no query string.

**Since #765 that line also carries the deadline**, read from the `exp` claim of whichever token is
configured rather than from anything recorded here — so the date above is a record of one mint and
never the thing a reader has to trust:

```
database hosted libsql://control-plane-saud-alnasser.aws-eu-west-1.turso.io, token expires 2027-08-22 (363 days left)
```

The token is not verified and nothing refuses on it, because the claim is unsigned and the clock is
the process's own. *The control plane read it in `database/database.ts`; nothing reads it now, and
the two databases stay on the account untouched.*

The live test cleans up after itself, and it did: both databases held zero rows in all four tables
afterwards. Nothing it does creates or deletes a database, so the account went from one to three
and stays there.

**A separate finding, from #552's Rust work rather than from this run**: those migrations cannot be
applied through a *sync* connection. `0003` drops and renames its tables, and the push that follows
fails with `no such table: main.complex`, measured 2026-08-20 against a live account. That is not a
defect, a replica receives the schema as pages, but it does mean a replica is not a way to install
a schema, and every runner here applies over the pipeline endpoint for that reason: #552's tests,
the desktop's `organization/migrate.rs`, and the package's `migration.ts`.

A live run creates a real database and is billed and quota-counted — the free tier permits 100.
**It is the human's call**, the same standing rule as pushing.

**It also leaves databases behind.** #552's live tests add four per run, named
`t552-<case>-<nonce>`, and #572's add two, named `ws-<uuid>` like any other workspace. Nothing in
this repository can remove one from a delete-protected group, and against a quota of 100 that is
worth watching rather than assuming.

*The inventory was a list of names until 2026-08-20 and is a description now, because a list that
grows by four whenever somebody runs a test is a list that is wrong more often than it is right.*

**Counted 2026-08-23, before the third run above: one database,
`ws-c8aa62a6-d4ea-45a6-a317-d2ca2530dd46`, with the group's `delete_protection` reading `true`.**
The two named here on 2026-08-18 and everything #552 and #572 left had gone.

**A person cleared the account on 2026-08-20, deliberately.** An audit that morning found thirty
databases — `gate-11`, seventeen `t552-*`, eleven orphan `ws-*` whose control-plane records no
longer existed, and one real workspace. Asked which should go, the human answered *delete
everything, we will start over*, and ran `wipe-turso.mjs` by hand from `apps/control-plane/`.
It was written for that one run and was never tracked. What it printed:

```
delete_protection -> false: 404
deleted 30, failed 0
delete_protection -> true: 404
delete_protection now: false
remaining: 0 (none)
```

**So the count is not the one-way climb the paragraph above describes.** Nothing in the shipping
code can remove a database it did not just create, but the Platform API token can remove any of
them, and a script holding it did.

**Both `PATCH` calls 404'd because the path was guessed.** The documented one carries
`delete_protection` on a sub-path: `PATCH /v1/organizations/{org}/groups/{group}/configuration`
for a group, `PATCH /v1/organizations/{org}/databases/{name}/configuration` for a single database.
`PATCH .../groups/{group}` is not a route.

**The database-level path was run live on 2026-09-11, at the human's request, and it holds.**
Effort 819's `platform.rs` created `t819-05-18d450c2cbb1d764` in group `rentable` with a
consent-issued group-scoped token, set `delete_protection` to `true` through that path, read it
back as `true` from the matching `GET`, minted a `1h` token, set the protection to `false`, and
deleted the database, in one run. So the documented path applies and reports the change, and a
database-level protection is lifted by the same grant that set it, which is why the desktop treats
it as a barrier against a stray delete and not as a guarantee. **The group-level path and the
question of why thirty deletes succeeded on 2026-08-20 are still untested.** Turso's create takes
no protection field, so on the desktop the protection is a second request made inside the create.

**What the run did not settle is why thirty deletes succeeded at all**, two days after
*Failure handling* measured a 403 refusing exactly that. Three readings of the group's own state
bracket the wipe and do not agree: `true` at 05:48, `false` at 05:53, `true` again on 2026-08-23.
Either that 404 applies the change while reporting it did not, or the 403 is narrower than
2026-08-18 read it. Both are testable against the documented path above, and neither has been
tested. **Until one is, treat the protection as something that has already failed to hold once.**

## Failure handling

Everything below becomes a typed `workspace_unavailable` refusal, and Turso's own message goes
to this process's log and never to the caller — it names a database and sometimes an
organization, and the caller is asking about a workspace. **A 5xx or a dropped connection is a
503 saying try again; a 4xx is a 502 saying it will not help**, because a 4xx is Turso refusing
on purpose and no number of attempts changes that.

- **A group that does not exist** fails the create. `TURSO_GROUP` has to name a real one.
- **A name already taken** fails the create. Names are `ws-<workspace id>`, so this means the id
  was reused, which is a defect here rather than a Turso problem.
- **A quota exceeded blocks the databases outright** unless overages are enabled (decision 01).
- **Revocation is per database and total.** `POST /v1/organizations/<org>/databases/<name>/auth/rotate`
  invalidates every token ever minted for that one database; the group-level rotate does the
  same for every database in the group. Seen live on 2026-09-12: a token minted before the
  rotation is refused on its next request with `401 {"error":"Unauthorized: \`unauthorized
  access attempt on database: invalid JWT token: role was invalidated after token was
  issued\`"}`, and a token minted after it lands. There is no per-token revocation, so
  rotation cannot remove one person without cutting off everybody on that database, which is
  why the desktop removes somebody by declining to renew and rotates only on a lock-out
  (`apps/desktop/tauri/src/organization/removal.rs`).
- **A database that is not there answers the sync engine, and the answer is a string.**
  `turso` 0.8.0-pre.7 carries no variant for a remote's answer: every refusal and every transport
  fault arrive as `turso::Error::Error(String)`, with an HTTP refusal spelled `status=NNN, body=…`
  inside it and a transport fault carrying no status at all. `platform.rs`'s `database_is_gone`
  reads a `404` out of that text, which is what tells a machine the owner deleted the organization
  (`organization/forget.rs`, effort 828 requirement 18); `401` and `403` are the credential's and
  never that. Pinned against a loopback server answering each, on 2026-09-16, in
  `organization/forget.rs`. **What a database deleted on this account actually answers has not
  been run**, because running it means deleting one. If it is not a `404`, a machine keeps what it
  holds and the person disconnects by hand, which is the direction that mistake should fail in.
- **A delete-protected group refuses to delete the databases inside it**, and the message is
  about the group rather than about what was asked for:
  `403 {"error":"group rentable is delete-protected and cannot be deleted"}` — returned for a
  `DELETE .../databases/<name>` call, on a database whose own `delete_protection` is `false`.
  Measured 2026-08-18. **The group on this account is protected**, so the control plane's cleanup
  path cannot run here: a workspace whose record could not be written leaves its database behind,
  logged. Turning that protection off is a change to the human's account and is theirs to make,
  and the endpoint that does it is `PATCH .../groups/{group}/configuration`.
  **This refusal has been observed not to hold.** Thirty deletes into this group succeeded on
  2026-08-20 while the two attempts to lift the protection both 404'd; *Verification* has the
  readings. Do not build a cleanup path on the assumption that a protected group will stop it.

## Never run

- **Do not delete a database this process did not just create, unless a human deleted the
  workspace in the interface.** A workspace's database is somebody's ledger, and nothing else is a
  reason to call it. **On the desktop the rule is a type**: `platform.rs`'s `delete_database` takes
  a `DeletionIntent`, and its variants are exactly the reasons named here, an owner deleting the
  workspace in the interface now, and a database this process just created and could not finish
  making into a workspace. Every live test removes what it provisioned by the second intent.
  **A third reason arrived on 2026-09-16 with effort 828's requirement 18**, and it is the owner
  deleting the whole organization in the interface: `OrganizationDeletedByHuman` removes every
  `ws-` database the organization's directory names and then the `org-<id>` directory itself, on
  the owner's own account, after their password has opened their own vault.
- **Do not delete `control-plane` or `control-plane-live-test`.** They are the retired control
  plane's, one holding every account, workspace, membership and session it decided on and the other
  what its live test wrote into; the application is gone and the databases are the human's. No
  code path in this repository may delete either, and `delete_database` cannot reach them anyway:
  every caller removes something it just created or a workspace a human deleted. **The group's delete protection is not the guarantee here.**
  A script holding the Platform API token cleared all thirty databases out of this group on
  2026-08-20, and these two would have gone with them.
- **Do not rotate or revoke the Platform API token.** It is the human's, and revoking it stops
  every mint.
- **Do not run a live create or mint against the human's account without being asked to.**
