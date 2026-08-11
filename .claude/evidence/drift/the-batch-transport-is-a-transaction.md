---
owner: repository
kind: drift
falsifies: [.claude/contexts/persistence.md]
---

# Is there a transaction across the IPC boundary?

Checked against this repository at `0d8bcfd`, 2026-08-11, while designing a complex-creation
flow that writes a complex and its units together.

## What the Context says

`.claude/contexts/persistence.md`, under **Constraints**:

> **No transactions across the boundary.** Multi-step writes are sequenced by the caller and
> are not atomic, so a write that must not half-apply needs its own recovery, not a rollback.

## What the source says

The batch command opens a transaction, runs every query of the batch inside it, and commits
at the end; a failing query returns an error and the transaction is dropped without a commit.
The single-query command refuses `BEGIN`, `COMMIT` and `ROLLBACK` outright, and its refusal
message says *use batch execution instead* — so the boundary does not merely permit a
transaction, it directs callers to the one path that gives them one.

The test transport does the same, and says so in its own doc comment: it runs a batch inside
a `better-sqlite3` transaction "as the Rust layer does". So the two transports agree, and a
router test over a batch exercises the same atomicity production has.

The drizzle client is built with both callbacks, and the installed driver (drizzle-orm
0.45.2) declares `batch` on the returned database type — so the capability is reachable from
TypeScript, not merely present in Rust.

## What is true instead

**No router uses it.** Every write in the application today is a separate single query, so
the *observed* behaviour the statement describes is real: multi-step writes as currently
written are not atomic. What is false is the reason given for it — that the boundary cannot
carry a transaction. It can, and the mechanism is already built, tested on both transports,
and unused.

The distinction matters because the statement is written as a constraint, and a constraint is
read as *this is not available*. Anyone planning a write that must not half-apply would have
designed a recovery path for a problem the batch command already solves.

## How to re-check

Read the batch command in the Rust database proxy and look for the transaction begin and the
commit around the query loop; read the single-query command above it for the refusal of
`BEGIN`/`COMMIT`/`ROLLBACK`. Then grep the TypeScript source for `.batch(` to confirm whether
a router has started using it — the day one does, the second half of this finding expires.
