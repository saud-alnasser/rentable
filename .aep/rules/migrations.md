---
paths:
  - apps/desktop/tauri/migrations/**
  - packages/workspace-migrations/**
  - apps/desktop/tauri/src/organization/transition/**
use-when: "adding or changing a workspace migration or an organization's change of format"
---

# Rule: migrations

*The human's call, 2026-09-27 (effort 838), from
[[efforts/838-permissions-are-a-role-and-an-override/evidence/research/how-updates-migrate-and-fall-back]].*

## Add before you remove

A migration that drops or renames a table or column an older build still reads or writes ships
only in a release after one in which no supported build reads or writes it. Add the new shape
first, move the application onto it, and remove the old shape later.

*Why: every machine on a workspace runs its own build, and a reshape takes every older build off
the workspace the moment one newer build opens it; Realm Sync and PowerSync allow only additive
shared changes for this reason.*

## A shipped migration is never edited

Once a migration file or a change of format has shipped, a correction is a new one after it.

*Why: a database is recorded at a version, and a step changed after it ran is a step that version
never had.*

## Every shipped version is seeded in the tests

A new migration or change of format comes with the seeded database of the version before it, so
the tests walk every version shipped from 0.14.0 on to the current one. Releases before that,
which kept their records in one local file, move over by the guided step of effort 838,
requirement 18, not by migration.

*Why: a step is only known to work from the versions it was run from, which is Room's practice.*
