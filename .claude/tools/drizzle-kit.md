# drizzle-kit

Generates migration SQL from the schema module. Configured in `drizzle.config.ts`: SQLite,
snake_case, schema read from `src/lib/platform/database/schema.ts`, SQL written into
`tauri/migrations/`.

Docs: <https://orm.drizzle.team/docs/kit-overview>. Fetch before any command not listed
here, and before changing the config.

## Generate a migration

```bash
pnpm db:generate
```

Run this after every schema change. The output goes to `tauri/migrations/` and is applied
by **Rust**, at app startup, tracked in its own table — not by drizzle-kit.

## The dev-only commands

```bash
pnpm db:migrate   # applies to DATABASE_URL — a convenience database, not the app's
pnpm db:studio
pnpm db:seed      # faker data
pnpm db:purge
```

**`DATABASE_URL` is not the running app's database.** It is read from `.env` by drizzle-kit
and by the seed and purge scripts only; the app resolves its own path from Tauri settings.
Pointing one at the other is a mistake, not a shortcut.
