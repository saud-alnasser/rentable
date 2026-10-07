---
paths:
  - packages/workspace-migrations/**
  - apps/desktop/tauri/src/upgrade/format/**
use-when: "adding or changing a workspace migration or an organization's change of format"
---

# Rule — migrations

*The human's call, 2026-09-27 (effort 838), from
[[efforts/838-permissions-are-a-role-and-an-override/evidence/research/how-updates-migrate-and-fall-back]].*

## Add before you remove

A migration that drops or renames a table or column an older build still reads or writes ships
only in a release after one in which no supported build reads or writes it. Add the new shape
first, move the application onto it, and remove the old shape later.

*Why: every machine on a workspace runs its own build, and a reshape is an upgrade (below): when a
holder of `upgradeData` runs it on purpose, after the sheet has shown who it leaves behind, the
floors it raises leave every older build read-only or stopped. Removing the old shape before no
supported build uses it would stop those builds at that upgrade; Realm Sync and PowerSync allow
only additive shared changes for this reason.*

## A shipped migration is never edited

Once a migration file or a change of format has shipped, a correction is a new one after it.

*Why: a database is recorded at a version, and a step changed after it ran is a step that version
never had.*

## Every shipped version is seeded in the tests

A new migration or change of format comes with the seeded database of the version before it, so
the tests walk every version shipped from 0.14.0 on to the current one. Releases before that,
which kept their records in one local file, move over by the guided step of
[[efforts/838-permissions-are-a-role-and-an-override/spec]], requirement 18, not by migration.

*Why: a step is only known to work from the versions it was run from, which is Room's practice.*

## Every step declares its kind and its floors

*The human's call, 2026-10-07 (effort 857), from
[[efforts/857-updating-never-locks-a-member-out/plan]], under Architecture.*

A new workspace migration or change of format is declared in `apps/desktop/tauri/src/database/step.rs`
in the same commit, as an **addition** or an **upgrade** with the floors it raises, and never in
its SQL. A test there fails while a migration file or a change of format has no declaration.

- **An addition** creates a table or an index, or adds a column that may be empty or has a
  default, and changes the meaning of nothing an older build reads or writes. It moves neither
  floor, and any machine whose build ships it runs it. `addition_sql_is_additive` checks the shape
  of its SQL.
- **An upgrade** is everything else: a drop, a rename, a rebuild, a re-signing, or an addition
  whose meaning an older build would get wrong. It runs only by the explicit upgrade, it declares
  the read floor and the write floor it raises, and it says whether it needs the owner's key.
- **A meaning change that only adds a column is split**: the column as an addition, and the step
  that lets a build write the new meaning as an upgrade raising the write floor. The capability that
  writes it waits for that upgrade.
- **The ticket that adds a step names its kind in its acceptance criteria**, so review judges the
  meaning, which the shape check cannot.
- **Steps shipped before 857 are marked `shipped_before_857` and still run on open** as 0.20 ran
  them, whatever their kind: data in users' hands stands behind them. A new step never carries the
  mark. An addition declared after them never moves `workspace.schema_version` or the `format` row,
  and the first one to run on a database writes its floor record (effort 857, ticket 03); data
  created on a build that ships one is created with the record already written (ticket 21).

*Why: an addition that stops nobody needs nobody's decision, and anything that can stop someone
waits for the person who holds the permission to upgrade and has seen who it stops. A step
misdeclared as an addition lets an older build write wrong data with no refusal, which is the risk
the declaration and its review exist to catch.*
