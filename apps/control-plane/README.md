# @rentable/control-plane

Accounts, workspaces, and membership for a hosted workspace — the middle tier of
[`a-workspace-follows-its-user`](../../.aep/efforts/a-workspace-follows-its-user/spec.md).

**It is in the credential path continuously and in the data path never.** A rents ledger lives
in a workspace database on Turso that offline clients replicate and sync with directly; this
process never reads or writes one. What it will own is who somebody is, which workspaces exist,
who belongs to which, and the short-lived token a client syncs with — so there is no domain
table here, and a schema test fails if one appears.

## What exists today, and what does not

Signing in. A Google access token becomes an account this database holds. **Nothing is deployed,
and nothing on the desktop calls any of it** — a local-only workspace reaches no account, and the
occasion to sign in here arrives with the mode choice rather than with signing in to Google.

|                                                                       |      |
| --------------------------------------------------------------------- | ---- |
| creating a workspace's database and minting the token to sync with it | #556 |
| settling a hosted workspace's schema at the mint                      | #557 |
| the desktop choosing to be hosted, which is what first calls this     | #553 |

## The routes

**Plain JSON over HTTP.** The desktop's tRPC runs in-process inside the webview with no HTTP
under it, so it is not a precedent for this one, and the only client there will be is the Rust
side — credentials never cross the IPC boundary, so the web layer is not the caller and cannot
become one. tRPC's whole return is inference into a TypeScript client, and there isn't one.

```
GET  /health            -> {"status":"ok"}
POST /account/sign-in   <- {"accessToken":"..."}   -> {"account":{...}}
```

A refusal is `{"error":{"code":"...","message":"..."}}`, and **the code is the part a client acts
on** — the message is for a person and names what to do.

| Code                    |          | What the caller does                                           |
| ----------------------- | -------- | -------------------------------------------------------------- |
| `identity_not_verified` | 401      | Google refused the token. Sign in again                        |
| `google_unreachable`    | 503      | The control plane could not ask. Retry with the same token     |
| `identity_incomplete`   | 502      | Google answered without a subject. A defect, not a stale token |
| `malformed_request`     | 400, 413 | Fix the caller                                                 |
| `unavailable`           | 500      | Something failed here, and the caller is told nothing more     |

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

**Both URLs go through the same libSQL client**, which is why it is here rather than the
`better-sqlite3` the desktop tests run on: deploying is out of scope for this effort, and
choosing a client that would have to be replaced to deploy is not the same as deferring it.

## The schema

Three tables, in `src/schema.ts`, and `src/schema.test.mjs` is what holds them to it.

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
