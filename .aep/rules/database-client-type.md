---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/platform/database/**
  - apps/desktop/src/lib/api/context.ts
use-when: "a database client is constructed, a transport is added, or the shape of a row crossing the IPC boundary is in question"
---

# Rule — one database client type

## Every database client is the same type, and reaches the engine through the same row mapping

`createDatabase(single, batch)` in `src/lib/platform/database/client.ts` is the only place a
client is built. Production passes Tauri's `invoke`; tests pass the in-memory engine in
`memory.ts`, which calls that same factory. Both are `SqliteRemoteDatabase<typeof schema>`, and
`Context.db` is typed structurally as that rather than as the app singleton, so a test client
satisfies it too. **Adding a transport means passing different functions to that factory — never
constructing a second kind of client.**

*Why: the proxy row-mapping is real logic sitting on the language boundary, and a test that
skips it verifies a system that does not ship.*

## Development tooling is excluded, deliberately

`apps/desktop/scripts/seed.ts` and `apps/desktop/scripts/purge.ts` build their own client on
`drizzle-orm/better-sqlite3`
and keep their own use of transactions. They are development tooling, not application code, and
they are not required to adopt the application's client type.

*Why: naming the exclusion is what stops it being read as a violation and "fixed" into one.*

Recorded originally as ADR 0001, *One database client type, shared by tests and production* —
the one decision of the thirty-four that the AEP 2.x transition (63a8811) left without a rule.
Restored 2026-08-17 from `.claude/decisions/0001-one-database-client-type.md` in history, at the
request of [[efforts/a-workspace-follows-its-user/spec]], which leans on it harder than anything
else in the tree.
