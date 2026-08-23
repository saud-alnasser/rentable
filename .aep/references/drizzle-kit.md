---
aep: 2.7.0
owner: repository
date: 2026-08-23
kind: reference
use-when: "the database schema changed and a migration has to be generated"
---

# drizzle-kit

Generates migration SQL from a schema module. **Two packages configure it and they are different
jobs**, which is the thing to get straight before running anything.

Docs: <https://orm.drizzle.team/docs/kit-overview>. Fetch before any command not listed
here, and before changing a config.

## Two schemas, two configs

| | `apps/desktop/drizzle.config.ts` | `apps/control-plane/drizzle.config.ts` |
| --- | --- | --- |
| what it describes | the **workspace** schema — a user's ledger | the control plane's **own** database: accounts, workspaces, membership, sessions |
| dialect | SQLite | `turso`, the same dialect over libSQL |
| schema read from | `apps/desktop/src/lib/platform/database/schema.ts` | `apps/control-plane/src/database/schema.ts` |
| SQL written to | `packages/workspace-migrations/migrations/` | `apps/control-plane/migrations/` |
| who applies it | **the control plane**, at the token mint | `drizzle-kit migrate`, **run by hand** |

**Nothing applies either set at startup**, and that is the row most often misread. The control
plane's own migrations are applied by somebody running `db:migrate:control-plane`; its test suite applies them
itself, in `src/tests/testing.ts`, which is why a migration that will not apply fails there rather
than on a deploy. Who applies a *workspace* migration is [[contexts/desktop/persistence]]'s, under
*Boundaries*.

**The control plane's two paths stay inside it. The desktop's `out` deliberately does not** — it
writes to `packages/workspace-migrations/`, because two packages ship the same SQL and a copy in
either one is a second place it can change.

*This section was wrong until 2026-08-20, in the direction that matters: it said the workspace
migrations go to `apps/desktop/tauri/migrations/` and are applied by Rust at app startup. **Rust
applies no migrations** since #568 and requirement 11 of
[[efforts/a-workspace-follows-its-user/spec]].*

## Generate a migration

```bash
pnpm db:generate:desktop         # the workspace schema
pnpm db:generate:control-plane   # the control plane's own
```

Every root script here names its application, because both have one of each and a bare `db:`
verb would leave which database it meant to the reader. Run it after every schema change, for the
package whose schema changed. It writes one `.sql` file
and updates `meta/`; read the file before committing it, because a generated migration that also
has to *move* data is rewritten by hand rather than replaced.

**Generating needs no database.** `apps/control-plane/drizzle.config.ts` refuses a configuration
that cannot work, and drizzle-kit loads the config for every one of its commands, so between #755
and #758 a `generate` on a clone with no `.env` refused as a `migrate` does. It does not now: the
config reads the invocation and applies the refusal to `migrate`, `push`, `introspect` and
`studio`, which open a database, and not to `generate`, `check`, `up`, `drop` and `export`, which
do not. `apps/control-plane/src/database/drizzle-kit.ts` is the list, and it is a second place that
knows drizzle-kit's commands — a drizzle-kit upgrade that adds one belongs there too, and its test
file is what says so out loud.

**Format what it wrote.** drizzle-kit rewrites `meta/_journal.json` with its own indentation, which
`prettier --check .` fails and the `integration` gate runs — so a generated migration lands with a
hundred-line diff over a seven-line change unless `pnpm format` follows it.

## Apply the control plane's own migrations

```bash
pnpm db:migrate:control-plane
```

**By hand, against `CONTROL_PLANE_DATABASE_URL`.** Nothing runs it at startup: `src/main.ts`
connects and listens, and a deploy that skipped this would serve a database missing its newest
table.

**Run against a hosted database for the first time on 2026-08-23**, #757. Every previous
application of these migrations had been to a file, so the `turso` dialect carrying them over the
wire was a configuration nobody had tested. One run against
`libsql://control-plane-saud-alnasser.aws-eu-west-1.turso.io` applied all seven and left `account`,
`workspace`, `membership` and `session`, with `__drizzle_migrations` holding one row per `.sql`
file in `migrations/`. [[references/turso]] has the rest of that run, including the two databases
it created.

## The dev-only commands

```bash
pnpm db:migrate:desktop   # applies to DATABASE_URL — a convenience database, not the app's
pnpm db:studio:desktop
pnpm db:seed:desktop      # faker data
pnpm db:purge:desktop
```

**`DATABASE_URL` is not the running app's database.** It is read from `apps/desktop/.env` by drizzle-kit
and by the seed and purge scripts only; the app resolves its own path from Tauri settings.
Pointing one at the other is a mistake, not a shortcut.
