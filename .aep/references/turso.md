---
aep: 2.5.1
owner: repository
date: 2026-08-18
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

Two things, and neither is in the data path: **creating the database a hosted workspace's data
lives in**, and **minting the short-lived token a client syncs with**. Reads and writes go
between a client's replica and its database directly; this API never sees a row of anybody's
ledger.

## Prerequisites

Three values, and `apps/control-plane/` **exits at startup** without them rather than failing
the first time somebody creates a workspace:

| | |
| --- | --- |
| `TURSO_API_TOKEN` | a **Platform API** token, not a database token — `turso auth api-tokens create`, or the dashboard |
| `TURSO_ORG` | the organization slug the paths are built from |
| `TURSO_GROUP` | an existing group the workspace databases are created in |

**`apps/desktop/.env` already holds a Platform API token and an org slug**, put there for the
decision 11 prototype. It is gitignored and it stays there. **It is the human's to rotate: do
not print it, do not commit it, and do not assume it is the one production uses.**

## Commands

There is no CLI in this repository's path. Everything is HTTP, from
`apps/control-plane/src/turso.ts`, against `https://api.turso.tech`, with
`Authorization: Bearer <TURSO_API_TOKEN>`.

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

`apps/control-plane/src/turso.test.mjs` runs the real client against a fake `fetch` and pins the
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

A live run creates a real database and is billed and quota-counted — the free tier permits 100.
**It is the human's call**, the same standing rule as pushing.

**It also leaves databases behind, and two are on this account now**: `gate-11` from the
decision 11 prototype, and `ws-effe2636-dccb-4dda-8e46-c0ad602bc1dc` from this verification.
Neither can be removed while the group is delete-protected.

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

- **Do not delete a database the control plane did not just create.** `deleteDatabase` exists for
  one path: a database created for a workspace whose record could not be written. A workspace's
  database is somebody's ledger.
- **Do not rotate or revoke the Platform API token.** It is the human's, and revoking it stops
  every mint.
- **Do not run a live create or mint against the human's account without being asked to.**
