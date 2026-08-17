---
aep: 2.2.0
owner: repository
date: 2026-08-17
kind: context
paths:
  - apps/desktop/src/lib/platform/database/**
  - apps/desktop/tauri/src/database/**
  - apps/desktop/tauri/migrations/**
use-when: "the request touches the schema, migrations, or how queries reach SQLite"
---

# Persistence

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
an in-memory engine that is type-identical to it.

The two share the row *reshaping* in `client.ts` and nothing below it. **Value conversion is
per-transport**, and both halves convert by the storage class SQLite reports for the value:
Rust reads it explicitly, better-sqlite3 by returning native values. Neither consults the
type a column was *declared* as — that type is absent for every expression, and dispatching
on it is what made a selected aggregate arrive as null (#287).

**A value whose storage class the conversion cannot map fails the query.** Nothing degrades to
null, because a null is indistinguishable from a column that was null and hides the gap that
produced it.

**That promise is about storage classes, not value ranges, and the difference is load-bearing.**
An `INTEGER` maps fine and then loses precision further down: both transports return integers as
JavaScript doubles, exact only to 2⁵³−1, and **neither errors** — `better-sqlite3` returns a lossy
number, and Rust's exact `i64` degrades at `JSON.parse` on the far side of the IPC boundary.
Measured on both, 2026-08-17: `9007199254740993` reads back as `9007199254740992`. So a column
that can exceed 2⁵³−1 is silently wrong, and no guarantee here covers it. The two transports
agree exactly, which is the one piece of good news — a router test pins this faithfully, unlike
the asymmetric cases below.

**Only Rust tests reach the Rust half.** The TypeScript harness executes under Node, so a
router test can pass over a conversion that is broken in the running application.

## Boundaries

- **The schema module is the single source of truth.** Table, validation, and type change
  together in one place; a change to one of the three without the others is a defect, not a
  partial edit.
- **Rust owns applying migrations.** The TypeScript side generates them and never runs them
  against the app's database.
- **Every query crosses the boundary as data** — statement, parameters, and the kind of
  result wanted. Nothing else about the engine is visible to the caller.

## Constraints

- **A transaction crosses the boundary as a batch, and only as a batch.** The batch command
  opens a transaction, runs every query inside it, and commits at the end; the single-query
  command refuses `BEGIN`, `COMMIT` and `ROLLBACK` outright and directs the caller to batch
  execution instead. The test transport does the same, so a router test over a batch
  exercises the atomicity production has. **A write that must not half-apply issues one
  batch** ([[rules/data]], under *Multi-table writes*); a
  multi-step write sequenced as separate queries is still not atomic, and that is a choice
  the caller made rather than a limit of the boundary.
- **A batch is built before any of it runs**, so a statement cannot read an identity an
  earlier statement in the same batch is about to assign. Where one needs it, it names the
  row by a value it already has — creating a complex with its units names the complex by
  its own unique name.
- **SQLite is compiled into the binary, and the driver owns that.** The engine links a
  bundled SQLite rather than a system library, asked for through the driver's own feature
  rather than by naming the native bindings as a direct dependency. Nothing here selects a
  TLS backend for the database: it speaks to a local file, and the TLS stack the crate does
  carry belongs to the HTTP client. Adding a direct dependency on the bindings to influence
  the build is the shape this deliberately does not have — it forces an exact version that
  must then track the driver's own range by hand.
