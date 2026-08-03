# Persistence

Sources: `src/lib/platform/database/`, `tauri/src/database/`, `tauri/migrations/`

How data is described once and reaches SQLite. The description lives in TypeScript; the
engine and the migration runner live in Rust; the two meet at Tauri's IPC boundary.

## Language

**Schema**:
The single description of an entity — its table, its validation, and its inferred type,
defined together. Routers derive their input shapes from it rather than restating fields.

**Migration**:
A generated SQL file applied once, in order, and recorded so it is never applied twice.
Generated from the schema, never hand-authored ahead of it.

**Transport**:
What carries a query to the engine. Production goes through IPC to Rust; tests go through
an in-memory engine that is type-identical to it, so the language-boundary mapping is
exercised rather than bypassed.

## Boundaries

- **The schema module is the single source of truth.** Table, validation, and type change
  together in one place; a change to one of the three without the others is a defect, not a
  partial edit.
- **Rust owns applying migrations.** The TypeScript side generates them and never runs them
  against the app's database.
- **Every query crosses the boundary as data** — statement, parameters, and the kind of
  result wanted. Nothing else about the engine is visible to the caller.

## Constraints

- **No transactions across the boundary.** Multi-step writes are sequenced by the caller
  and are not atomic, so a write that must not half-apply needs its own recovery, not a
  rollback.
