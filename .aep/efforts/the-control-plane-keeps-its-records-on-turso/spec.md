---
aep: 2.7.0
owner: repository
date: 2026-08-22
kind: spec
status: accepted
---

# Problem

**The control plane's own database is a file on whoever ran it.** `database/database.ts`
falls back to `file:./control-plane.db` when `CONTROL_PLANE_DATABASE_URL` is unset, and there
is such a file in `apps/control-plane/` right now. Accounts, workspaces, membership and
sessions — everything that decides whether a person may open their workspace — live on one
developer machine.

**Nothing in the package was built for that**, which is what makes this worth an effort rather
than a shrug. The client is `@libsql/client` and its own comment says why: a `file:` URL
locally and a `libsql://` one once this is deployed, through the same client, *"picking a
client that cannot be deployed without being replaced is not the same thing as deferring it"*.
`drizzle.config.ts` declares `dialect: 'turso'` for the same reason and already reads the URL
and the token from the environment. `.env.example` already documents both. The support is
built and unused.

Three things cost something today:

- **The one input that decides where the records are is the one input with no startup
  refusal.** `TURSO_API_TOKEN`, `TURSO_ORG` and `TURSO_GROUP` each exit the process when
  unset, on the reasoning written into `main.ts`: a control plane that cannot provision looks
  healthy right up until somebody creates a workspace. The database URL gets none of it. Unset,
  it silently opens a local file; set to a `libsql://` URL with an empty token, it starts,
  listens, and answers `/health` with a 503 that names no cause, because the route deliberately
  keeps the reason out of the body. That is the exact failure the guard beside it exists to
  prevent.
- **Nothing has ever reached a hosted control-plane database.** The test suite migrates a real
  file with the real migrations, so the schema is exercised and the row mapping is the one that
  ships. The wire is not. [[references/turso]] records two live runs and both are about
  *workspace* databases; the control plane's own has never been created, migrated, or served
  from.
- **No second machine can ever be brought up against it.** Not deployment, which is a later
  question — simply that two processes, or one process moved, cannot share state that lives in
  one person's working directory.

# Goal

The control plane's own database is a Turso database, reached over libSQL by the client already
in the tree. A configuration that cannot work is refused at startup instead of at the first
query. A local file stays available for development and says so when it is what is in use. And
the hosted path has been run rather than reasoned about.

# Scope

- `apps/control-plane/src/database/database.ts` — the connection and the guard around it.
- The four entrypoints that connect: `main.ts`, `sweep.ts`, `decline.ts`, `prune.ts`.
- `apps/control-plane/.env.example` and `apps/control-plane/README.md`.
- [[references/turso]] and [[references/drizzle-kit]], which describe what the control plane
  does to Turso and who applies its migrations.
- One live provisioning of the control plane's own database on the human's Turso account, one
  `db:migrate:control-plane` against it, and one run of the process serving from it.

**This moves where the control plane's state lives. It does not move where the control plane
runs**, which stays whatever machine somebody starts it on. The deployment exclusion in
[[efforts/a-workspace-follows-its-user/spec]] is unchanged by this effort and is restated under
*Out of Scope* so that nobody has to infer it.

# Requirements

1. **An unset database URL refuses the process at startup**, naming the variable and pointing at
   `.env.example`, in the shape `required()` already uses for the three Turso platform
   variables. The silent `file:./control-plane.db` default goes.
2. **A hosted URL with no token refuses the process at startup**, for the same reason and in the
   same shape. A hosted database rejects an unauthenticated connection, and finding that out at
   the first query is finding it out too late.
3. **A `file:` URL stays legal and is announced as local.** Development, the test suite, and an
   offline day all need it; what they do not need is it arriving by accident, which requirement
   1 is what ends.
4. **The database token never reaches a log line, a response body, or a caller.** The startup
   line already prints the URL, which carries no credential; nothing added here may change that
   property.
5. **Every entrypoint that connects gets the same refusal.** A command run by a person against
   the wrong database is the same defect as a server serving from it, and `sweep`, `decline` and
   `prune-sessions` each connect through the same function.
6. **A Turso database exists for the control plane's own records, carrying every migration in
   `apps/control-plane/migrations/`**, applied by the documented command rather than by hand or
   by a runner written for the occasion.
7. **The control plane serves from that database**: `/health` answers ok, a sign-in creates an
   account, a session and a workspace, and a mint returns a token — the transaction in
   `workspace.ts` included, since it is the one operation whose behaviour over a remote
   connection is inferred rather than observed.
8. **What was run, and against what, is written into [[references/turso]]** — including the
   distinction that the control plane's own database is not a `ws-` workspace database and is
   deleted by no code path in this repository.
9. **The setup is documented where somebody configuring this would look**: `.env.example` and
   the control plane's README, both of which currently describe the local file as the ordinary
   case.

# Acceptance Criteria

1. A test proves that connecting with `CONTROL_PLANE_DATABASE_URL` unset refuses rather than
   opening a file, and the message names the variable.
2. A test proves that a `libsql://` URL with no token, and one with a whitespace-only token, are
   both refused, and that the same URL with a token is accepted.
3. A test proves a `file:` URL is accepted. Running the process against one prints a line that
   says the database is local, and the existing suite still passes with no network and no
   account.
4. A test asserts that what the process announces at startup contains the URL and does not
   contain the token it was given.
5. Running each of `sweep`, `decline` and `prune-sessions` with the URL unset exits non-zero with
   the same message the server gives, and a test covers the shared function all four call.
6. `pnpm db:migrate:control-plane` against the hosted URL completes, and the schema it leaves
   carries every table in `src/database/schema.ts` and one applied-migration row per file in
   `migrations/`.
7. With the hosted URL configured, `/health` returns `{"status":"ok"}`, a sign-in through the
   real route returns an account, a session and one workspace, and those rows are readable back
   out of the hosted database. A transaction that throws part-way through leaves none of its
   writes behind, which is what proves the transaction crossed the wire rather than degrading
   into unrelated statements.

   *The second sentence read "a sign-up whose workspace record fails leaves neither a workspace
   row nor a membership row" until `/plan` read the code. It names a state `createWorkspace`
   cannot reach: the losing side of that race throws `RaceLost` before it has written anything,
   so its rollback is unobservable and a criterion resting on it would pass without measuring
   the property. The rewritten sentence asks for the same fact where it can actually be seen.*
8. [[references/turso]] names the database, the date it was created, what was run against it,
   and the never-delete rule, in its existing *Verification* and *Never run* sections.
9. `.env.example` and the README describe the hosted database as the ordinary configuration and
   the file as the development one, and neither reproduces a token.

# Constraints

- **One database client.** `@libsql/client` covers both the file and the hosted database, which
  is the property that made a test over a file worth running in the first place. A second driver
  would end it.
- **Remote-only, no embedded replica.** libSQL will keep a local file synced from a hosted
  database, and this service must not use it: a session or a membership row read from a stale
  replica is a credential decision made on old state, and this process is in the credential path
  continuously.
- **The test suite keeps building its own file-backed databases.** Tests must not need a network,
  an account, or the human's token. `src/tests/testing.ts` is unchanged by this effort.
- **Migrations stay applied by a person running the command.** Nothing here makes the process
  migrate itself at startup; who applies them is [[references/drizzle-kit]]'s answer and it does
  not change.
- **A live create is billed, counted against the free tier's hundred, and irreversible from
  here.** The group on this account is delete-protected and refuses to delete the databases
  inside it ([[references/turso]], measured 2026-08-18), so a database created for this cannot be
  removed by this repository. One database, created once, and the count is worth watching.
- **The token is the human's.** Not printed, not committed, not assumed to be the one anything
  else uses. `.env` and `*.db*` are gitignored and stay that way.

# Out of Scope

- **Deploying the control plane.** No host, no domain, no process manager, no operational
  surface. The exclusion in [[efforts/a-workspace-follows-its-user/spec]] stands; this effort
  moves the state and leaves the process where it is. *Stated rather than inferred, because "the
  database is hosted now" is one sentence away from "so is the service".*
- **Applying migrations at startup.** Named because requirement 6 puts a hosted database one
  forgotten command away from being out of date, and closing that gap automatically is the
  obvious next move and a different decision.
- **Anything about workspace databases.** They already live on Turso, `workspace/turso.ts` is
  untouched, and the mint, the sweep and the provisioning path behave exactly as they do today.
- **Backups, point-in-time restore, and a runbook for the hosted database.** Turso's own, and
  whoever administers the account decides them.
- **More than one environment.** No staging database, and no notion of which database is which
  beyond what the environment variable in front of the process says.
- **Token rotation, scoping, or a place to keep secrets other than `.env`.** A hosted database
  needs a token; where that token lives once something other than a person starts this process
  belongs to the effort that stands it up.
- **The desktop client.** It reaches a control plane by URL and knows nothing about where that
  plane keeps its records. Nothing in `apps/desktop/` changes.

# Assumptions

- **drizzle-kit's `turso` dialect applies migrations to a remote database over the wire.** It is
  configured for exactly that and [[references/drizzle-kit]] documents the command, and no run
  against a remote has ever been recorded. Requirement 6 is what converts this into a fact.
- **A token minted for a database that is not a `ws-` workspace behaves as the workspace tokens
  do** — same endpoint, same expiration spelling, same scoping to one database.
  [[references/turso]]'s live findings all come from workspace databases.
- **An interactive transaction survives a remote connection.** Drizzle's libSQL driver
  implements `db.transaction()` by calling the client's own `transaction()` rather than by
  emitting `begin` and `commit` as loose statements (read in `drizzle-orm` 0.45.2,
  `libsql/session.js`), so the remote leg is the protocol's rather than a sequence of unrelated
  requests. That is inference from the driver's source until acceptance criterion 7 runs it.
- **One person operates this.** Inherited from [[efforts/a-workspace-follows-its-user/spec]], and
  nothing here adds an operator identity or an audit trail.
- **The existing local `control-plane.db` holds nothing anybody needs.** It is a development
  file, gitignored, and no data is carried out of it.

# Open Questions

- **What the database is named, and which group it goes in.** `ws-<workspace id>` is the
  workspace convention and this is not a workspace, so it needs a name that cannot be mistaken
  for one. The group is the human's to pick, and the delete-protected one has the consequence
  the *Constraints* record.
- **Whether a `file:` URL should have to be opted into more loudly than by being spelled out** —
  an explicit development flag, say. Requirement 1 removes the accident; whether that is enough
  is a question for [[skills/plan]].

# Risks

- **The free tier's hundred databases, and a group that will not delete.** [[references/turso]]
  already records that live test runs leave databases behind and that the count is not stable
  enough to list. One more is small; the risk is that nobody is watching the total.
- **A misconfigured token turns a local failure into a remote one.** Today a wrong configuration
  fails on this machine. With a hosted database, a token that expires or is rotated takes the
  control plane down for everything pointed at it, and the symptom is the same 503 the health
  route gives for any database it cannot reach.
- **The live run is against the human's real account.** It creates a real database, it is billed,
  and it cannot be undone from here. Requirements 6 and 7 are the only live steps, and both are
  written as one run rather than as something a test loop repeats.

# Architecture

**Where the database is gets resolved once, from the environment, by a function that returns a
value.** Everything else about how the control plane reaches its records is unchanged: the same
`@libsql/client`, the same drizzle wrapper, the same schema, the same migrations, and the same
tests over `file:` databases. What is added is a decision point that today does not exist, and the
refusal that comes out of it.

Three things were decided here. Each names what lost, because an alternative left unmentioned is a
decision taken silently.

**1. A pure resolver, plus one function the entrypoints call instead of `connect()`.**
`resolveDatabase(env)` reads the two variables and answers with a configuration or a refusal, and
touches nothing outside its arguments — which is what lets acceptance criteria 1 through 4 be
covered directly, the level [[rules/testing]] puts pure logic at. `connectOrExit(report)` is the
thin thing around it that the four entrypoints call.

- *Rejected: `connect()` throws and each entrypoint catches.* No module but an entrypoint could
  end the process, which is the cleaner rule. It costs the same three lines in four files, and
  `required()` already exists twice in this package, which is what that shape turns into.
- *Rejected: a shared `startup.ts` holding this guard and `required()` together.* It would end
  the existing duplication, and it rewrites the Turso platform guard this effort was not asked to
  touch. Raise it; do not take it (`[[policies/engineering]]`, smallest sufficient change).

**2. The URL's scheme decides whether a token is required.** `file:` is local. Every other scheme
is hosted and refuses without `CONTROL_PLANE_DATABASE_TOKEN`.

- *Rejected: requiring a token only for `libsql:`, `https:` and `wss:`*, so that an unauthenticated
  `http://127.0.0.1:8080` sqld would work. It lost because a typo that downgrades a real hosted URL
  to `http:` would then be accepted in silence, and nothing in this repository runs a local sqld
  today. **The condition that reopens it is the first person who wants `turso dev`**, and the
  change is one branch in one function.

**3. The live check runs against a second hosted database that is reused, never created per run.**
Two hosted databases exist: the one the control plane serves from, and one that only the opted-in
live test touches, named by `CONTROL_PLANE_LIVE_TEST_DATABASE_URL` and its token.

- *Rejected: provisioning a throwaway control-plane database per live run*, the shape
  `workspace/tests/provisioning.test.ts` uses. The group on this account is delete-protected and
  refuses to delete the databases inside it, so every live run would leave one behind for good,
  against a free-tier cap of a hundred.
- *Rejected: a single human-run verification with no test at all.* Cheapest, and it leaves the
  connection path checked by whoever remembers. The wire is the thing this effort exists to stop
  taking on faith, so a claim in a reference that nobody can repeat is the wrong artifact for it.
- **Not considered acceptable: pointing the live test at the real hosted database.** It would need
  no second database and it writes test rows into the records the control plane serves from.

# Components

| File | What changes |
| --- | --- |
| `src/database/database.ts` | gains `resolveDatabase`, `describe` and `connectOrExit`; `connect` takes a resolved configuration instead of reading the environment; `databaseUrl` goes |
| `src/main.ts` | `connectOrExit(console.error)`, and the startup line announces the resolution rather than the URL |
| `src/sweep.ts`, `src/decline.ts`, `src/prune.ts` | the same one-line substitution, reporting through the pino logger each already has |
| `drizzle.config.ts` | the `?? 'file:./control-plane.db'` fallback goes, so a migrate with nothing configured refuses instead of building a stray file |
| `src/database/tests/database.test.ts` | new: the resolver, the announcement, and the structural check that no entrypoint calls `connect` directly |
| `src/database/tests/hosted.test.ts` | new: the opted-in live test |
| `.env.example`, `README.md` | the hosted database becomes the ordinary configuration |
| `[[references/turso]]`, `[[references/drizzle-kit]]` | what was run, against what, and what must never be deleted |

# Interfaces

```ts
export type DatabaseConfiguration =
	| { kind: 'local'; url: string }
	| { kind: 'hosted'; url: string; authToken: string };

/** a configuration, or the sentence to print before exiting. Pure: it reads nothing it was not given. */
export type Resolution = { configured: DatabaseConfiguration } | { refusal: string };

export const resolveDatabase: (env: NodeJS.ProcessEnv) => Resolution;

/** what the process says it is connected to. Carries no credential and no query string. */
export const describe: (configuration: DatabaseConfiguration) => string;

export const connect: (configuration: DatabaseConfiguration) => Client;

/** for entrypoints only: resolve, or report and exit 1. */
export const connectOrExit: (report: (message: string) => void) => {
	client: Client;
	describedAs: string;
};

export const database: (client: Client) => Database;
```

`resolveDatabase` takes its environment rather than defaulting to `process.env`, so a test cannot
accidentally read the machine's own and a caller cannot accidentally forget which one it meant.
`connectOrExit` is the single place a *process* reads `process.env`. `drizzle.config.ts` is the
one other caller, and it reads it for a command rather than for a server, which is why it throws
the refusal instead of exiting — see *drizzle-kit* below. *Corrected during implementation: this
said the single place, full stop, which the same document's drizzle-kit section below had already
made false.*

# Technical Approach

## The resolution

| Environment | Result |
| --- | --- |
| URL unset, empty, or whitespace | refusal naming `CONTROL_PLANE_DATABASE_URL` and pointing at `.env.example` |
| URL that `new URL` will not parse | refusal saying it needs a scheme. `./control-plane.db` throws `ERR_INVALID_URL`, whose message names neither the variable nor the fix |
| URL carrying `authToken` in its query | refusal saying the token belongs in `CONTROL_PLANE_DATABASE_TOKEN` |
| `file:` | `{ kind: 'local' }` |
| any other scheme, token unset or blank | refusal naming `CONTROL_PLANE_DATABASE_TOKEN` |
| any other scheme, token present | `{ kind: 'hosted' }` |

Both values are trimmed before they are judged, which is what makes a whitespace-only token a
refusal rather than a token. `required()` in `main.ts` already trims for the same reason.

## What the process announces

`describe` builds its answer from the parsed URL rather than passing the raw string through:
`hosted libsql://cp-....turso.io` from the protocol and the host, and `local file
./control-plane.db` from the path. **The raw URL is never printed**, because libSQL accepts
`?authToken=` inside it, which was confirmed by parsing one, and a startup line that would print
whatever the query string holds is a line that can print a credential.

*This narrows acceptance criterion 4 deliberately rather than quietly: the criterion says the
announcement carries the URL and not the token, and what is built here carries the scheme and the
host. That identifies the database for the person reading it and carries nothing that could be a
secret, which is what the criterion is for.*

## The entrypoints

Each replaces `const client = connect()` with `const { client, describedAs } = connectOrExit(...)`
and prints `describedAs` where it printed `databaseUrl()`. `main.ts` reports through
`console.error`, for the reason its own comment already gives: the refusal happens before a server
exists to log through. The three commands report through the pino logger each already builds.

## drizzle-kit

`drizzle.config.ts` imports `resolveDatabase` and throws its refusal message rather than carrying
a second copy of the rule, so `pnpm db:migrate:control-plane` and the running process cannot
disagree about which database is configured.

*If drizzle-kit's config bundling will not take the import*, the fallback is to inline the two
checks in the config with a comment pointing at the resolver, and that is the only thing about
this file that is allowed to be decided at implementation time.

## The live test

`src/database/tests/hosted.test.ts`, in the shape [[rules/testing]] fixes under *Tests that reach a
live remote*: opted into with `RENTABLE_LIVE_TURSO=1`, skipped with `node:test`'s
`{ skip: '<reason>' }` so the skip reaches the summary line, and **failing rather than skipping**
when the opt-in is set and the credentials are not. It never runs in continuous integration.

Four parts, in order:

1. **Migrate.** `migrate()` from `drizzle-orm/libsql/migrator` against `../../migrations`, which is
   idempotent and is what `src/tests/testing.ts` already does over a file. Then assert every table
   in `src/database/schema.ts` is present, and that `__drizzle_migrations` holds one row per `.sql`
   file in `migrations/`. That table name is the migrator's own default, read from
   `drizzle-orm` 0.45.2 rather than remembered.
2. **The real routes, against the hosted database.** `runningControlPlane` from
   `src/tests/testing.ts`, bound to a drizzle instance over the hosted client, with
   `tursoInMemory()` as the platform. `/health` answers ok, a sign-in returns an account, a session
   and one workspace, and those rows are read back out of the hosted database with a separate
   query. **No workspace database is provisioned**: what is under test is the control plane's own
   records over the wire, and provisioning already has its own live test.
3. **A transaction that throws leaves nothing.** `db.transaction(async (tx) => { insert; throw })`
   directly against the hosted client, then assert the row is absent. This is the assumption the
   spec lists, converted: drizzle implements `db.transaction()` by calling the client's own
   `transaction()`, and this is what establishes that the remote honours it rather than degrading
   into unrelated statements. `createWorkspace`'s own rollback path cannot serve here, because its
   loser throws before it has written anything.
4. **Clean up what it wrote**, in reverse dependency order, keyed on the account it created, in a
   `finally`. A cleanup that fails says which rows it left.

# Testing Strategy

| Criterion | Checked by |
| --- | --- |
| 1 unset URL refuses | `database.test.ts`, `resolveDatabase({})` |
| 2 hosted URL with no token refuses | `database.test.ts`, with an absent, an empty and a whitespace-only token, and the same URL with one accepted |
| 3 a `file:` URL is accepted and announced as local | `database.test.ts`, plus the whole existing suite continuing to pass with no network |
| 4 no token in what is announced | `database.test.ts`: `describe` of a hosted configuration contains neither the token nor a query string, and a URL carrying `authToken` is refused |
| 5 every entrypoint refuses alike | a structural assertion in `database.test.ts`, in the style `src/tests/boundary.test.ts` already uses: every file directly under `src/` that connects calls `connectOrExit` and none calls `connect`. Plus one spawn of `prune-sessions` with `CONTROL_PLANE_DATABASE_URL=''`, asserting a non-zero exit and the message, which is what proves the refusal ends a process rather than only returning a sentence |
| 6 migrations apply to a hosted database | `pnpm db:migrate:control-plane` against the real hosted URL, run once by the human; the live test's part 1 is what keeps it true |
| 7 the control plane serves from it | the live test, parts 2 and 3 |
| 8 the reference records the run | the file |
| 9 the setup is documented | the files |

**A blanked variable beats a `.env` file**, which is what makes criterion 5's spawn honest:
`dotenv` does not override a key already present in `process.env`, and an empty string is present.

# Operational Considerations

- **Two hosted databases exist after this, and both are permanent.** The group refuses deletes.
  Nothing in this repository may delete either, and `[[references/turso]]`'s *Never run* section is
  where that is written down.
- **The order at implementation time**: create the two databases and mint a token for each, put the
  URL and token in `apps/control-plane/.env`, run `pnpm db:migrate:control-plane`, start the
  process, sign in. Every one of those is the human's to authorise, one at a time.
- **The token's expiration is a choice with a deadline attached.** A database token minted with
  `expiration=3d`, the spelling this repository uses everywhere else, would take the control plane
  down three days later. The token for these two databases is the human's to mint and to decide the
  lifetime of.
- **Nothing about continuous integration changes.** The live test is opted into and the gate never
  sets the opt-in.
- **The desktop is untouched.** `RENTABLE_CONTROL_PLANE_URL` still names a process, not a database.
- `apps/control-plane/control-plane.db` stops being written by anything and can be deleted by hand.
  It is gitignored, so nothing else notices.

# Technical Risks

- **drizzle-kit may not bundle a config that imports from `src/`.** It bundles the config before
  running it, and the resolver pulls in `@libsql/client` and the schema. The fallback is named
  above, and it is checked by running `pnpm db:migrate:control-plane` against a `file:` URL before
  anything is pointed at a hosted one.
- **The live test adds a network to a suite that already has a Windows fault.** `src/tests/run.ts`
  exists because `@libsql/win32-x64-msvc` faults under load and its file gets killed. A live run
  adds latency and a remote that can be slow, and a timeout there would arrive looking like that
  fault. Mitigation: the live test is opted into, so an ordinary run is exactly what it is today.
- **The two hosted databases can drift.** The real one is migrated by hand and the test one by the
  test. That is deliberate, and it means the test cannot catch a migration nobody applied to
  production. What catches that is running the documented command, which is criterion 6.
- **A failed cleanup leaves rows in the test database.** Visible, harmless, and reported by the test
  rather than swallowed.
- **A local `file:` URL still opens a database that may be empty.** Nothing here migrates on
  startup, so `file:` plus a forgotten `db:migrate:control-plane` is still a process that starts and
  fails its first query. That is unchanged by this effort and is what the *Out of Scope* entry on
  startup migration names.
