---
aep: 2.7.0
owner: repository
date: 2026-08-23
kind: reference
use-when: 'provisioning a workspace database, minting a token to sync with one, or reading what the control plane does to Turso'
---

# Turso — the Platform API

**This file is yours.** It records how Turso is actually reached from
`apps/control-plane/`; correct it where the repository differs rather than deferring to what
the documentation says.

Docs: <https://docs.turso.tech/api-reference>
Fetch the docs when a call you need is not listed below. **Never guess an endpoint or a
parameter name** — the response fields are Go struct names showing through and are not what a
JSON API usually looks like.

## Purpose

Two things, and neither is in the data path: **creating the database a workspace's data lives
in**, and **minting the short-lived token a client syncs with**. Reads and writes go
between a client's replica and its database directly; this API never sees a row of anybody's
ledger.

**Since 2026-08-23 the control plane's own records are on Turso as well, and they do not come
through this API.** `control-plane` is an ordinary libSQL database that `@libsql/client` reaches
over the wire, the same way a client reaches its workspace's. All this API did for it was create it
once and mint one token; everything after that is SQL. Its URL and token are
`CONTROL_PLANE_DATABASE_URL` and `CONTROL_PLANE_DATABASE_TOKEN`, and
`apps/control-plane/.env.example` is where they are documented.

## Prerequisites

Three values, and `apps/control-plane/` **exits at startup** without them rather than failing
the first time somebody creates a workspace:

| | |
| --- | --- |
| `TURSO_API_TOKEN` | a **Platform API** token, not a database token — `turso auth api-tokens create`, or the dashboard |
| `TURSO_ORG` | the organization slug the paths are built from |
| `TURSO_GROUP` | an existing group the workspace databases are created in |

**`apps/desktop/.env` already holds a Platform API token and an org slug**, put there for the
decision 11 prototype. **It does not hold `TURSO_GROUP`**, which is the one a reader trips on:
`apps/control-plane/.env.example` is where all three are named, and a run that exports the two
that are to hand gets a client that cannot create anything. It is gitignored and it stays there. **It is the human's to rotate: do
not print it, do not commit it, and do not assume it is the one production uses.**

## Commands

There is no CLI in this repository's path. Everything is HTTP, against `https://api.turso.tech`,
with `Authorization: Bearer <TURSO_API_TOKEN>`.

**Two callers now, and only one of them ships.** `apps/control-plane/src/workspace/turso.ts` is the
service, and it is the one the endpoints below are documented for.
`apps/desktop/tauri/src/database/test/workspace.rs` is the other, added 2026-08-20 by #552: it
provisions and destroys a database per test so that two replicas have something to diverge against,
and it is `#[cfg(test)]` and `#[ignore]`d — [[rules/testing]], under *Tests that reach a live
remote*, is what bounds it. Nothing in the shipping desktop binary reaches this API.

```
POST   /v1/organizations/{org}/databases
       {"name": "ws-<workspace id>", "group": "<TURSO_GROUP>"}

POST   /v1/organizations/{org}/databases/{database}/auth/tokens?expiration=3d&authorization=full-access

DELETE /v1/organizations/{org}/databases/{database}
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

**`Hostname` has a capital H**, and so do the other two. `turso.ts` reads either spelling,
because a change to it would be a silent total failure of the one route the control plane
exists for.

The hostname carries no scheme. `libsql://` is prepended where it is used — that URL and the
`libsql://` the sync client takes are the same string, confirmed by the decision 11 prototype.

## Verification

`apps/control-plane/src/workspace/tests/turso.test.ts` runs the real client against a fake `fetch` and pins the
path, the credential, the query parameters and the shape read back.

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
end* for want of exactly this, and `apps/control-plane/src/workspace/tests/provisioning.test.ts` is
what exercises it.

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

The live test cleans up after itself, and it did: both databases held zero rows in all four tables
afterwards. Nothing it does creates or deletes a database, so the account went from one to three
and stays there.

**A separate finding, from #552's Rust work rather than from this run**: those migrations cannot be
applied through a *sync* connection. `0003` drops and renames its tables, and the push that follows
fails with `no such table: main.complex`, measured 2026-08-20 against a live account. That is not a
defect — requirement 11 puts migrations on the control plane and a replica receives the schema as
pages — but it does mean a replica is not a way to install a schema, and #552's tests apply theirs
over the pipeline endpoint for that reason. Nothing in `apps/control-plane/` opens a sync connection,
so nothing here would have found it.

A live run creates a real database and is billed and quota-counted — the free tier permits 100.
**It is the human's call**, the same standing rule as pushing.

**It also leaves databases behind.** #552's live tests add four per run, named
`t552-<case>-<nonce>`, and #572's add two, named `ws-<uuid>` like any other workspace. Nothing in
this repository can remove one from a delete-protected group, and against a quota of 100 that is
worth watching rather than assuming.

*The inventory was a list of names until 2026-08-20 and is a description now, because a list that
grows by four whenever somebody runs a test is a list that is wrong more often than it is right.*

**Counted 2026-08-23, before the third run above: one database,
`ws-c8aa62a6-d4ea-45a6-a317-d2ca2530dd46`, with the group's `delete_protection` still `true`.**
The two named here on 2026-08-18 and everything #552 and #572 left had gone.
**How is not known from here.** Nothing in this repository
deletes into a protected group, so whatever removed them was done outside it. Recorded because the
paragraph above says the count only climbs, and the measurement says it does not.

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
- **Revocation is bulk-only** and rotates every token in the group, with no published
  propagation time. It cannot remove one person, which is why the control plane removes somebody
  by declining to renew instead.
- **A delete-protected group refuses to delete the databases inside it**, and the message is
  about the group rather than about what was asked for:
  `403 {"error":"group rentable is delete-protected and cannot be deleted"}` — returned for a
  `DELETE .../databases/<name>` call, on a database whose own `delete_protection` is `false`.
  Measured 2026-08-18. **The group on this account is protected**, so the control plane's cleanup
  path cannot run here: a workspace whose record could not be written leaves its database behind,
  logged. Turning that protection off is a change to the human's account and is theirs to make.

## Never run

- **Do not delete a database the control plane did not just create.** `deleteDatabase` has two
  callers and both created what they remove: the service's own path, where a database was made for a
  workspace whose record could not be written, and the teardown in
  `workspace/tests/provisioning.test.ts`, which removes what its live run provisioned. A workspace's
  database is somebody's ledger, and nothing else is a reason to call it.
- **Do not delete `control-plane` or `control-plane-live-test`.** One holds every account,
  workspace, membership and session the control plane decides on; the other is what the live test
  writes into, and it is reused rather than recreated for exactly this reason. No code path in this
  repository may delete either, and `deleteDatabase` cannot reach them anyway: both its callers
  remove something they just created. **The group's delete protection is not the guarantee here.**
  Whatever cleared this account on or before 2026-08-23 got past it.
- **Do not rotate or revoke the Platform API token.** It is the human's, and revoking it stops
  every mint.
- **Do not run a live create or mint against the human's account without being asked to.**
