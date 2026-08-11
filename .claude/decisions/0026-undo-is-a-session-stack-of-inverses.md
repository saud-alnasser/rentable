---
owner: repository
status: accepted
load-when: a data mutation is added, or undo, redo, or recovering a deleted record is in question
sources: [src/lib/design/, src/lib/api/]
supersedes: []
superseded-by: []
---

# Undo is a session stack of inverses, replayed through the real procedures

The application had no way back from a mistake: every mutation was final the moment it was
confirmed, and the only recovery was a snapshot restore, which throws away everything since.
**Undo and redo are a stack held for the life of the session. Each data mutation records the
call that reverses it, and undoing issues that call through the same procedure a typed action
goes through** — so validation, reconciliation, cache invalidation and the autosync push all
fire exactly as they do for the original, and there is no second write path that could
diverge from the first.

## Considered Options

**A durable journal of before/after row images**, written in the same transaction as the
mutation, surviving restart and travelling to Google Drive with the workspace. Rejected for
what it does at the remote boundary: a workspace is one syncable unit, and a conflict is
already resolved by choosing a whole side. A history that crosses that boundary has to answer
whose history survives when the remote copy wins, and there is no answer that is not either
"discard it" — which is this decision, at greater cost — or a merge this application has
deliberately never had (ADR 0005 detects concurrency rather than preventing it).

**Soft deletes**, a flag per row with a restore view. Rejected on a fact that only became
visible while reading the delete procedures: **every delete in this application already
refuses when the record has dependents** — a complex holding units, a unit held by a
contract, a tenant with contracts, a contract with units or payments. So a delete that
succeeds removes exactly one childless row, and its inverse is one insert. Soft deletes would
buy nothing for undo, while taxing every read across six tables — where a missed filter
surfaces as a wrong derived status rather than as an error — and leaving four unique columns
held by tombstones, so re-adding a tenant you just deleted would fail until partial indexes
existed to stop it.

## Consequences

**The stack does not survive a restart, and this is the deliberate half.** An inverse is a
statement about a database, and the workspace's database can be replaced underneath it — by a
sync pull, a backup restore, or switching workspace. Replaying an inverse across one of those
would corrupt rather than undo, so **the stack is cleared whenever the workspace is
replaced**, and a session boundary is simply the case where that happens for certain.

**Every new mutation has to declare its inverse, and nothing enforces that it did.** A
procedure added without one is silently outside undo — the same failure shape the autosync
middleware already has, and it is accepted for the same reason: the alternative is a generic
mechanism that reaches under the domain rules rather than through them.

**Restoring a deleted record keeps its identity.** The inverse of a delete re-inserts the
captured row with its original id, not a fresh one, because a page open on that record is a
live reference to the id and would otherwise be pointing at nothing after an undo that
claimed to have put the record back.

**Undo is not rollback and not restore.** Those two words are already spoken for here — the
protected pre-update backup, and snapshots — and this decision deliberately does not reuse
either.
