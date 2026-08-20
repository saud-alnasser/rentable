---
aep: 2.7.0
owner: repository
date: 2026-08-20
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
plane's own migrations are applied by somebody running `db:migrate`; its test suite applies them
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
pnpm db:generate                                  # the desktop's, from apps/desktop/
pnpm --filter @rentable/control-plane db:generate  # the control plane's, from anywhere
```

Run it after every schema change, in the package whose schema changed. It writes one `.sql` file
and updates `meta/`; read the file before committing it, because a generated migration that also
has to *move* data is rewritten by hand rather than replaced.

**Format what it wrote.** drizzle-kit rewrites `meta/_journal.json` with its own indentation, which
`prettier --check .` fails and the `integration` gate runs — so a generated migration lands with a
hundred-line diff over a seven-line change unless `pnpm format` follows it.

## Apply the control plane's own migrations

```bash
pnpm --filter @rentable/control-plane db:migrate
```

**By hand, against `CONTROL_PLANE_DATABASE_URL`.** Nothing runs it at startup: `src/main.ts`
connects and listens, and a deploy that skipped this would serve a database missing its newest
table.

## The dev-only commands

```bash
pnpm db:migrate   # applies to DATABASE_URL — a convenience database, not the app's
pnpm db:studio
pnpm db:seed      # faker data
pnpm db:purge
```

**`DATABASE_URL` is not the running app's database.** It is read from `apps/desktop/.env` by drizzle-kit
and by the seed and purge scripts only; the app resolves its own path from Tauri settings.
Pointing one at the other is a mistake, not a shortcut.
