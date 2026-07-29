---
status: accepted
---

# No repository layer; routers reach the database directly

Business rules live in per-concept domain modules. Routers validate, call the domain,
persist, and reconcile — and they use Drizzle directly, with no repository abstraction
between them and the database.

## Considered Options

A repository layer was considered and rejected. This is a single-process application with
one embedded SQLite database that will not be substituted, so the portability argument does
not apply; and the testability argument that normally justifies repositories is already paid
for by [0001](0001-one-database-client-type.md) — the in-memory client is type-identical to
production, so procedures are already exercisable without mocking persistence.

Recording the rejection matters more than recording the choice: a layered-architecture
reader will see routers importing Drizzle and read it as an omission rather than a decision,
and "add a repository layer" is the obvious thing to re-propose.

## Consequences

Nothing structural stops a rule from being written inline in a procedure — there is no
repository to hide behind and no seam that would make the mistake fail. The discipline that
domain rules live in their concept's own module is therefore carried by review and by
`.claude/rules/api-layer.md`, not by the architecture.
