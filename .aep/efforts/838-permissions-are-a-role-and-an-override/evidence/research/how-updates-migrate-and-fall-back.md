---

---

# Question

Is an ordered chain of per-version migration steps, walked in sequence from the version a database is at to the version a build ships, plus a fallback for corruption, the approach that mature client-side, offline and synced applications use; and, measured against what they do, where do rentable's two update paths (workspace schema, organization format) already match it and where do they not?

Asked by the human during effort 838, 2026-09-27. Researched 2026-09-27 against the code at the `_run` worktree of effort 838 (HEAD at the time of reading) and the sources below.

# Sources

All read 2026-09-27. Primary unless marked.

Rentable itself (observation):
- `apps/desktop/tauri/src/organization/migration.rs` (lease, refusal of a newer schema, copy, apply, record)
- `apps/desktop/tauri/src/organization/migrate.rs` (embedded drizzle-kit SQL, `/v2/pipeline` runner, `apply_between`)
- `apps/desktop/tauri/src/organization/upgrade.rs` (`walked`, the format runner) and `transition/mod.rs`, `transition/test/older.rs`
- `apps/desktop/tauri/src/backup.rs`, `apps/desktop/tauri/src/database/version.rs`, `apps/desktop/tauri/build.rs`
- `packages/workspace-migrations/migrations/0000..0005*.sql`

SQLite and libSQL:
- SQLite, ALTER TABLE: https://www.sqlite.org/lang_altertable.html
- SQLite, PRAGMA reference: https://www.sqlite.org/pragma.html
- SQLite, VACUUM: https://www.sqlite.org/lang_vacuum.html
- libSQL HTTP v2 spec (the `/v2/pipeline` endpoint): https://raw.githubusercontent.com/tursodatabase/libsql/main/docs/HTTP_V2_SPEC.md
- Hrana 3 spec: https://raw.githubusercontent.com/tursodatabase/libsql/main/docs/HRANA_3_SPEC.md
- Turso, Embedded Replicas: https://docs.turso.tech/features/embedded-replicas/introduction

Client platforms:
- Android `SQLiteOpenHelper.java` (AOSP source): https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/master/core/java/android/database/sqlite/SQLiteOpenHelper.java
- Android Room, Migrate your Room database: https://developer.android.com/training/data-storage/room/migrating-db-versions (and its `#test` section)
- Room `MigrationContainer` reference: https://developer.android.com/reference/android/arch/persistence/room/RoomDatabase.MigrationContainer
- Room path finder source, `room3-runtime/.../util/MigrationUtil.kt`: https://raw.githubusercontent.com/androidx/androidx/androidx-main/room3/room3-runtime/src/commonMain/kotlin/androidx/room3/util/MigrationUtil.kt
- Room 2.x `RoomOpenHelper.java` (a public mirror of the AndroidX source, marked: mirror, not the canonical repository): https://github.com/topjohnwu/room-runtime/blob/master/runtime/src/main/java/androidx/room/RoomOpenHelper.java
- Apple, Migrating your data model automatically: https://developer.apple.com/documentation/coredata/migrating-your-data-model-automatically
- Apple, NSStagedMigrationManager: https://developer.apple.com/documentation/coredata/nsstagedmigrationmanager
- Apple, WWDC23 session 10186 "What's new in Core Data" (staged migration): https://developer.apple.com/videos/play/wwdc2023/10186/
- MongoDB, Realm Node.js SDK, Change an Object Model: https://www.mongodb.com/docs/atlas/device-sdks/sdk/node/model-data/modify-an-object-schema/ (the page states Atlas Device SDKs are deprecated)
- Firefox `toolkit/components/places/Database.cpp`: https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/places/Database.cpp
- Signal Desktop `ts/sql/migrations/index.node.ts`: https://raw.githubusercontent.com/signalapp/Signal-Desktop/main/ts/sql/migrations/index.node.ts

Sync systems:
- PowerSync, Implementing Schema Changes: https://docs.powersync.com/maintenance-ops/implementing-schema-changes
- PowerSync client architecture (schemaless JSON plus views; seen through search result summaries of https://docs.powersync.com/architecture/client-architecture, marked: not read in full)
- Replicache, ReplicacheOptions.schemaVersion: https://doc.replicache.dev/api/interfaces/ReplicacheOptions and pull reference https://doc.replicache.dev/reference/server-pull (the latter seen through a search summary, marked)
- WatermelonDB, Migrations: https://watermelondb.dev/docs/Advanced/Migrations
- Electric, Shapes guide: https://electric.ax/docs/guides/shapes

Alternatives:
- Atlas, Declarative vs versioned: https://atlasgo.io/concepts/declarative-vs-versioned
- Martin Fowler's bliki, ParallelChange (Danilo Sato, 2014-05-13): https://martinfowler.com/bliki/ParallelChange.html
- Django, Migrations, squashing and transactions: https://docs.djangoproject.com/en/5.2/topics/migrations/#migration-squashing
- Rails Guides, Active Record Migrations: https://guides.rubyonrails.org/active_record_migrations.html
- Axon Framework 4.11, Event versioning (upcasting): https://docs.axoniq.io/axon-framework-reference/4.11/events/event-versioning/
- MongoDB blog, The Schema Versioning Pattern (Alger and Coupal, 2019): https://www.mongodb.com/blog/post/building-with-patterns-the-schema-versioning-pattern (a vendor pattern write-up; the vendor's own guidance, so treated as primary for the pattern)
- Ink & Switch, Project Cambria (October 2020): https://www.inkandswitch.com/cambria/

# Findings

## 1. Chained N to N+1 steps are the norm; the alternatives each fit a different shape

**F1.1 source.** Android's framework runs an app's upgrade inside a transaction ("This method executes within a transaction. If an exception is thrown, all changes will automatically be rolled back") and tells developers never to edit a released step: "You should NOT modify an existing migration step from version X to X+1 once a build has been released... Instead, a NEW migration step should be created to correct the error." (`SQLiteOpenHelper.java`, AOSP master.) True of Android's platform SQLite helper.

**F1.2 source.** Room chains `Migration(from, to)` objects. The path finder in `MigrationUtil.kt` (room3, androidx-main) walks from the start version and, at each step, takes the migration from the current version with the *highest* target not past the end (`getSortedDescendingNodes`), so a direct 1 to 3 migration is preferred over 1 to 2 to 3 when both are registered. No path raises `IllegalStateException` unless `fallbackToDestructiveMigration()`, `fallbackToDestructiveMigrationFrom(versions)` or `fallbackToDestructiveMigrationOnDowngrade()` is set, each of which deletes the data (Room migration guide). After the steps run, Room validates the resulting schema against the compiled one and throws "Migration didn't properly handle" on a mismatch (`RoomOpenHelper.java`, mirror).

**F1.3 source.** Signal Desktop keeps every step since version 1 in one ordered array `SCHEMA_VERSIONS` (a removed step is left as a comment, "version 5 was dropped"), asserts the versions are strictly increasing at start-up, refuses a database above its newest version with `DBVersionFromFutureError`, and runs "as many migrations as possible in a single transaction", committing early only where a step asks for `VACUUM`, and writing `PRAGMA user_version` inside that transaction (`index.node.ts`, main).

**F1.4 source.** Firefox Places runs its whole walk, `MigrateV53Up` through `MigrateV87Up` as `if (currentSchemaVersion < N)` blocks, inside one `mozStorageTransaction`, sets the schema version last, then commits. Versions below 52 ("older than Firefox 68 ESR") are no longer migrated: "it's safer to just replace the database", and "ANY FAILURE IN THIS METHOD WILL CAUSE US TO MARK THE DATABASE AS CORRUPT AND TRY TO REPLACE IT." (`Database.cpp`, main.)

**F1.5 source.** WatermelonDB: "Each migration must migrate to a version one above the previous migration"; "If the migration fails, the database will fail to initialize, and will roll back to previous version"; with no path from an old version, or with a database newer than the code, "the database will reset." Realm: ascending integer `schemaVersion`, one `onMigration(oldRealm, newRealm)` function guarded by `if (oldRealm.schemaVersion < N)` per version; opening with a lower version than the file is an error; `deleteRealmIfMigrationNeeded` is for development only.

**F1.6 source.** Core Data's lightweight migration is *not* chained: it infers a mapping from source model to destination model directly, and a renaming identifier works "going from version 2 to version 3, or from version 1 to version 3" (Migrating your data model automatically). Staged migration (`NSStagedMigrationManager`, iOS 17 / macOS 14) was added for what inference cannot do, and does it by decomposing the change into "a series of smaller, lightweight-eligible changes" run "in the order you specify", with `willMigrateHandler` and `didMigrateHandler` around custom stages (WWDC23 10186). **interpretation:** Apple's own step away from direct migration, for hard changes, was back towards an ordered chain.

**F1.7 source.** Declarative diffing: "the desired state of the database schema is given as input to the migration engine, which plans and executes a set of actions"; versioned files instead "describe the changes themselves", are reviewed in source control and suit "on-premise software deployments or limited CI/CD database access"; `atlas schema apply` "requires approval before execution" (Atlas). **interpretation:** a desired-state planner run on an end user's machine has no human to approve its plan, and a diff cannot see a data transform (rentable's format 1 to 2 re-signs every row), so diffing fits shipped desktop software poorly; the planned files it generates can still be committed as versioned steps.

**F1.8 source.** Squashing and baselines: Django squashes many steps into one that `replaces` them and recommends keeping the old files until "all systems are upgraded with the new release... and then remove the old files"; Rails says loading `schema.rb` "tends to be faster and less error prone... than it is to replay the entire migration history", which "makes it possible to delete or prune old migration files." **interpretation:** squashing trades away old installs. On a server you know when every install has passed a version; on shipped desktop software you do not, which is why Firefox pairs its cut-off with a replace (F1.4) and WatermelonDB with a reset (F1.5).

**F1.9 source.** Expand and contract (parallel change): "a pattern to implement backward-incompatible changes to an interface in a safe manner, by breaking the change into three distinct phases: expand, migrate, and contract", the old shape removed only "after all clients have transitioned" (Sato, 2014).

**F1.10 source.** Lazy / on-read migration: Axon's upcasters turn an event of revision X into revision X+1 "as a chain", applied when events are read, because the store is "read and append-only" (Axon 4.11). MongoDB's schema versioning pattern stores a `schema_version` per document and lets the application choose "updating all documents to the new design, updating when a record is accessed, or not at all", at the cost of "handling functions for each schema version" (MongoDB, 2019). **interpretation:** upcasting is itself a chain of per-version steps; what differs is *when* it runs (per read rather than once) and that the stored data is never rewritten.

**F1.11 source.** Local-first lenses: Cambria (Ink & Switch, October 2020) starts from "we can't actually change all our systems at once", translates between versions with bidirectional lenses at read time, and reports that "Interoperability requires trading off between irreconcilable design goals" and that some conversions work reliably in one direction only. **interpretation:** a research prototype over JSON documents; it has no SQL-relational production analogue found.

## 2. What mature client apps do at the edges

**F2.1 source.** `PRAGMA user_version` is "an integer that is available to applications to use however they want. SQLite makes no use of the user-version itself" (PRAGMA reference). Signal and Firefox both keep their version there (F1.3, F1.4), inside the same file and the same transaction as the schema it describes.

**F2.2 source.** SQLite's 12-step procedure for a change ALTER TABLE cannot make: turn `foreign_keys` off, start a transaction, create `new_X`, copy, drop `X`, rename, rebuild indexes, triggers and views, "run PRAGMA foreign_key_check to verify that the schema change did not break any foreign key constraints", commit, turn foreign keys back on. `PRAGMA foreign_keys` "is a no-op within a transaction" (lang_altertable, pragma). Django: SQLite supports DDL transactions, and "all migration operations will run inside a single transaction by default."

**F2.3 source, downgrade policy.** Four policies are in use: refuse (Signal's `DBVersionFromFutureError`; Realm's error; Android's default `onDowngrade` throws "Can't downgrade database"); wipe (Room's `fallbackToDestructiveMigrationOnDowngrade`, WatermelonDB's reset); run-and-rewind (Firefox: "The only thing we will do for downgrades is setting back the schema version, so that next upgrades will run again the migration step", which requires every step to be safe to run twice); and none found that keeps and translates newer data except Cambria.

**F2.4 source, testing.** Room: "you should include a test that covers all migrations defined for your app's database", with exported schema JSON per version kept in version control so `MigrationTestHelper.createDatabase(1)` can build a database of any old version and `runMigrationsAndValidate` checks the result (Room migration guide, testing section).

## 3. Fallback and corruption

**F3.1 source.** `VACUUM INTO` writes "a consistent snapshot of the original database"; interrupted, the output "might be incomplete and corrupt"; it is "an alternative to the backup API" (VACUUM). `PRAGMA integrity_check` checks b-tree structure and UNIQUE, CHECK and NOT NULL constraints but "does not find FOREIGN KEY errors"; `foreign_key_check` finds those; `quick_check` skips UNIQUE and index-content checks (PRAGMA reference).

**F3.2 source.** Firefox's fallback for a corrupt or unmigratable Places database is backup-and-replace (`BackupAndReplaceDatabaseFile`, the `.corrupt` file name, `places.database.cloneOnCorruption`) rather than a down-migration (`Database.cpp`). **interpretation:** no source read here ships down-migrations to end users as the fallback; the fallbacks found are the transaction's rollback (F1.1, F1.3, F1.4, F1.5), a kept copy, a replace, or a wipe and resync (F1.5, F4.3). Down-migrations appear in server tooling, not in these clients (see Not checked).

## 4. Mixed versions across synced machines

**F4.1 source.** Realm Sync: synced realms "only support non-breaking - also called additive - changes to ensure that older clients can sync with newer clients"; a rename or type change requires a client reset (Realm docs). PowerSync: "The developer is responsible for keeping client-side schema changes backwards-compatible with older versions of client apps"; versioned streams "can serve different data to different client versions"; a removed column reads as `undefined`, a removed table as empty (PowerSync). Replicache carries `schemaVersion` in every push and pull, and the server may answer `VersionNotSupported` (Replicache reference; pull reference via search summary). Electric invalidates every shape on a table whose schema changes, and the client gets `409` / `must-refetch` and must "discard local data and initiate a fresh synchronization" (Electric shapes guide).

**F4.2 interpretation.** Every sync system read here does one or more of: restrict shared-schema changes to additive (Realm, PowerSync), version the wire so the server can refuse or translate (Replicache, PowerSync streams), or force a resync after a breaking change (Electric, Realm client reset). None lets an older client keep writing against a reshaped shared schema. That is expand and contract (F1.9) plus a version gate.

**F4.3 source.** Turso's Embedded Replicas page, as read, says nothing about schema changes, migrations or DDL with embedded replicas. The searches on turso.tech found migration tooling posts (Atlas, Geni) but no guidance for mixed client versions over embedded replicas. **This absence is a finding.**

## 5. Rentable, measured against the above

**F5.1 observation, organization format.** `transition::TRANSITIONS` is an ordered list, one file per step; a test asserts it starts at 1 and moves by one, and the shipped format is counted from it (`transition/mod.rs`). `upgrade::walked` checks every due step's refusal first, copies, then runs every due step and the `format` row in **one** transaction (`in_one_transaction`), and pushes after. A fixture of format 1 "as the build before effort 838 left it" is walked through the upgrade in tests (`transition/test/older.rs`). **interpretation:** this matches Signal and Firefox (F1.3, F1.4) closely, and exceeds them in one way: refusal checks run before the copy.

**F5.2 observation, workspace schema.** `migrate::apply_between` posts every statement of the pending tail as `execute` requests plus `close` in one `/v2/pipeline` request, with no `BEGIN`/`COMMIT`, and reads the per-statement results afterwards. The HTTP v2 spec says: "The server always executes all requests, even if some of them return errors", and Hrana streams are in autocommit unless a `BEGIN` is sent (Hrana 3). **interpretation, not measured:** a statement that fails in the middle of a tail leaves every statement before it committed *and every statement after it attempted and, where it can, committed*. The workspace is then at no numbered version; the recorded version is not advanced; and a retry replays the tail from the old number, where `CREATE TABLE` or `ALTER TABLE ADD` statements already applied will fail. Of rentable's shipped files, `0003` has 51 statement breakpoints and drops and renames tables (`migrate.rs` doc comment), which is the shape where this matters most. This is the largest gap against F1.1 to F1.5 and F2.2.

**F5.3 observation.** The workspace's schema version is recorded in the **organization** replica (`store.record_schema_version`, then `store.push()`), not in the workspace database the statements changed. **interpretation:** the version and the schema cannot commit together, unlike `user_version` in Signal and Firefox (F2.1). The code orders them (apply, record, push, release) and says why; a crash between apply and record is covered only by the lease expiry and a re-run, which F5.2 makes unsafe.

**F5.4 observation.** Neither path runs a post-migration check: no `integrity_check`, `quick_check` or `foreign_key_check` anywhere under `apps/desktop/tauri/src` (grep), and nothing like Room's schema validation (F1.2) comparing the migrated schema with the one a fresh build creates. `0005` notes that drizzle-kit wrote no `PRAGMA foreign_keys=OFF` there; SQLite's own procedure pairs table rebuilds with `foreign_key_check` (F2.2).

**F5.5 observation, testing.** Workspace tests cover the runner against a scripted server (tail selection, ordering, one pipeline, refusal inside a 200) and the lease, copy and refusal paths (`migrate.rs`, `migration.rs` tests). **No test was found that builds a real workspace at each old version with rows, walks it to the shipped version, and checks the data** (the Room recommendation, F2.4). The only multi-version test found applies a schema up to a version on a live Turso account, `#[ignore]`d (`database/mod.rs`).

**F5.6 observation, fallback.** `backup.rs` takes a logical copy inside one read transaction, reads it back and compares row counts, keeps three, and, where the owner's account is held, a protected seeded database on Turso. There is no in-app restore. **interpretation:** the copy is sound as a snapshot (it is what `VACUUM INTO` would give, done logically because the engine will not copy a replica file, per the module comment); what is missing is the path back, which Firefox and WatermelonDB have in the form of replace or reset (F3.2, F1.5).

**F5.7 observation, mixed versions.** Workspace: an older build refuses a newer schema and reads nothing; a read-only member cannot migrate; one member migrates under a lease. Organization: only the owner upgrades; others refuse with `OrganizationOlder` and wait, pulling first. **interpretation:** this is the refuse policy (F2.3) plus a version gate, matching Signal and Realm for downgrade. What it does not have is expand and contract (F1.9, F4.1): a breaking step (a drop or rename, as `0003` was) takes every older build off the workspace the moment one newer build opens it, and an older build's unpushed writes can become unsendable (`OrganizationChangesUnsendable`, `upgrade.rs`), which is the loss the sync systems in F4.1 avoid by allowing only additive shared changes.

# Conclusion

**The human's model is the mainstream one, and the evidence supports it for this app.** Ordered per-version steps walked from the stored version to the shipped one is what Android, Room, Signal Desktop, Firefox, WatermelonDB and Realm ship, and what Apple added staged migration to get back to for hard changes (F1.1 to F1.6). Direct any-to-latest (Core Data lightweight), declarative diffing and lenses each win only where changes are inferable, reviewed by a human at apply time, or document-shaped (F1.6, F1.7, F1.11); none fits a shipped desktop app whose steps include data transforms. The chain alone is not what those apps rely on, though. They pair it with four things: the walk and the version commit together, the result is checked, every old version is tested, and a failure has a way out.

**Where rentable matches.** The organization format path matches best practice: an ordered list checked by a test, refusal before any write, a copy, the whole walk and the `format` row in one local transaction, a fixture of the old format walked in tests (F5.1). Both paths refuse data newer than the build (F5.7), as Signal, Realm and Android do. The pre-change copy is a consistent snapshot, verified by row counts (F5.6).

**Where it does not.** These are the evidence's gaps, ranked by how much harm they risk against how much they cost. The ranking is the researcher's reading of the evidence. The choice is the human's.

1. **The workspace tail is not atomic** (F5.2, F5.3). Cost: small to moderate. The evidence points at wrapping the tail in `BEGIN` ... `COMMIT` on one stream, or at a Hrana batch whose steps are conditioned on the previous `ok` with a `ROLLBACK` on error (Hrana 3). Whether libSQL's server takes every statement in `0003` inside one explicit transaction was **not measured**. Where it does not, the fallback is one transaction per step, with the step's number written in the same transaction, which needs a version row inside the workspace database itself (F2.1).
2. **No per-version fixture test for the workspace** (F5.5, F2.4). Cost: moderate, once. The evidence points at building a local SQLite at each shipped version from the embedded files, seeding rows, walking to the shipped version, and comparing with a fresh build's schema and with expected rows. No Turso account is needed, because the statements are plain SQLite.
3. **No post-migration check** (F5.4, F1.2, F2.2). Cost: small. The candidates are `PRAGMA foreign_key_check` and `quick_check` inside the transaction before commit, plus a comparison of `sqlite_schema` against the schema a fresh build creates, which is Room's check.
4. **No restore** (F5.6, F3.2). Cost: moderate, because putting a copy back onto a Turso primary that other replicas have pulled from is itself a sync event, and no Turso guidance was found for it (F4.3). The copies already exist; the evidence finds nothing on how to restore safely over embedded replicas.
5. **No expand and contract for shared data** (F5.7, F4.1). Cost: a discipline, not code. It is the only answer found for "an older build keeps working while a newer one migrates". It would mean additive steps first and destructive ones a release or more later. Without it, the refuse policy is correct but blunt.
6. **Squashing** (F1.8). Cost: nothing now. With six workspace files and one format step there is no replay cost to remove. On shipped software, squashing needs a cut-off version below which a database is replaced or refused, as Firefox does; it is not a present need.

**One transaction per step or for the whole walk:** the apps read here use the whole walk (Signal, Firefox, Android) or per-step with the version written inside each step's transaction (Room's per-step path, Signal when a step needs `VACUUM`). Both are sound. What none of them does is commit statements with no transaction around them, or record the version in a different database from the schema, which is what the workspace path does today.

Confidence: high on what the named platforms do (their source or reference docs). Medium on F5.2's consequence: it follows from the spec and the code, and it was not reproduced against a live database.

# Not checked

- **F5.2 was not reproduced.** No pipeline with a failing middle statement was sent to a Turso database. Whether libSQL accepts every DDL statement of `0003` inside one explicit `BEGIN` over `/v2/pipeline` was not tested.
- Whether `two.rs` runs any invariant check of its own before commit: `walked` was read, `two.rs` (1588 lines) was not read in full.
- Turso: no guidance found on migrations or restores with embedded replicas (F4.3). The Turso Atlas and Geni blog posts were seen in search results only, not read.
- ElectricSQL's legacy (pre-"Next") client-side migrations were seen only through secondary search summaries and are not used as findings.
- PowerSync's client architecture page and Replicache's pull reference were seen through search summaries only (marked above).
- Automerge's own schema-evolution work beyond Cambria, and down-migration tools (Flyway undo, Rails `down`): the Flyway baseline page returned 404 and was not replaced.
- Room's 2.x `RoomOpenHelper` was read from a public mirror, not the AndroidX repository. Its "no explicit transaction" reading is the mirror's; the Android framework wraps `onUpgrade` in one (F1.1).
- Core Data's staged migration was read through the WWDC23 session page summary and the reference abstract, not a sample project.
