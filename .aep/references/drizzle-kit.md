---
use-when: "the database schema changed and a migration has to be generated"
---

# drizzle-kit

Generates migration SQL from a schema module. **One package configures it since 2026-09-12**;
it was two until the control plane retired with
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and the second column below is kept
as the record of what its job was, because the distinction it drew is the thing a reader still
has to get straight: the workspace schema is generated here and applied elsewhere.

Docs: <https://orm.drizzle.team/docs/kit-overview>. Fetch before any command not listed
here, and before changing a config.

## One schema, one config *(two until 2026-09-12)*

| | `apps/desktop/drizzle.config.ts` | `apps/control-plane/drizzle.config.ts` **(retired)** |
| --- | --- | --- |
| what it describes | the **workspace** schema — a user's ledger | the control plane's **own** database: accounts, workspaces, membership, sessions |
| dialect | SQLite | `turso`, the same dialect over libSQL |
| schema read from | `apps/desktop/src/lib/platform/database/schema.ts` | `apps/control-plane/src/database/schema.ts` |
| SQL written to | `packages/workspace-migrations/migrations/` | `apps/control-plane/migrations/` |
| who applies it | **the desktop, over the wire**, at creation and under a lease | `drizzle-kit migrate`, **run by hand** |

**Nothing applies the workspace set to a replica at startup**, and that is the row most often
misread: it is applied to the workspace's database on the organization's account through its
pipeline endpoint, by whichever member creates or opens it, and every replica receives it as
pages. Who applies a *workspace* migration is [[contexts/desktop/persistence]]'s, under
*Boundaries*. *The control plane's own migrations were applied by somebody running
`db:migrate:control-plane`, and its test suite applied them itself, which is why a migration that
would not apply failed there rather than on a deploy.*

**The desktop's `out` deliberately leaves the package** — it writes to
`packages/workspace-migrations/`, because two runners ship the same SQL (`build.rs` embeds it for
Rust, `packages/turso-platform/migration.ts` reads it in TypeScript) and a copy in either one is a
second place it can change.

*This section was wrong until 2026-08-20, in the direction that matters: it said the workspace
migrations go to `apps/desktop/tauri/migrations/` and are applied by Rust at app startup. **Rust
applies no migrations** since #568 and requirement 11 of
[[efforts/a-workspace-follows-its-user/spec]].*

## Generate a migration

```bash
pnpm db:generate:desktop         # the workspace schema
```

The root script names its application, because two applications had one of each and a bare `db:`
verb would leave which database it meant to the reader; the suffix stays now that there is one,
because the name records which database the verb means. Run it after every schema change. It
writes one `.sql` file
and updates `meta/`; read the file before committing it, because a generated migration that also
has to *move* data is rewritten by hand rather than replaced.

**Generating needs no database.** *The control plane's config learned this between #755 and
#758: drizzle-kit loads the config for every one of its commands, so a config that refused a
missing `.env` refused `generate` as it did `migrate`, and the fix was to apply the refusal to
`migrate`, `push`, `introspect` and `studio`, which open a database, and not to `generate`,
`check`, `up`, `drop` and `export`, which do not. That config retired with it; the desktop's reads
`DATABASE_URL` and refuses nothing, so a drizzle-kit upgrade that adds a command needs no list
kept here.*

**Format what it wrote.** drizzle-kit rewrites `meta/_journal.json` with its own indentation, which
`prettier --check .` fails and the `integration` gate runs — so a generated migration lands with a
hundred-line diff over a seven-line change unless `pnpm format` follows it.

## Apply the control plane's own migrations — **retired 2026-09-12 with the application**

*`pnpm db:migrate:control-plane` ran by hand against `CONTROL_PLANE_DATABASE_URL`, because nothing
ran it at startup and a deploy that skipped it would serve a database missing its newest table. It
ran against a hosted database for the first time on 2026-08-23, #757, which was the first time the
`turso` dialect had carried these migrations over the wire: one run against the `control-plane`
database applied all seven and left `account`, `workspace`, `membership` and `session`. That
database and `control-plane-live-test` are still on the human's account, untouched by the
retirement, and [[references/turso]] under *Never run* says they stay so.*

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
