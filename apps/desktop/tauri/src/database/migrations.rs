use sqlparser::dialect::SQLiteDialect;
use sqlparser::parser::Parser;
use sqlx::{AssertSqlSafe, Pool, Sqlite};
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{diagnostics, error::Error};

// A macro rather than a `const` so the statements below can `concat!` it: sqlx accepts
// only `&'static str` without an injection assertion, and a name interpolated at runtime
// would force one on statements that are entirely fixed at compile time.
macro_rules! table_name {
    () => {
        "__migrations__"
    };
}

const CREATE_TABLE: &str = concat!(
    "CREATE TABLE IF NOT EXISTS ",
    table_name!(),
    "(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);"
);

const SELECT_APPLIED: &str = concat!("SELECT id FROM ", table_name!(), " WHERE name = ? LIMIT 1;");

const INSERT_APPLIED: &str = concat!("INSERT INTO ", table_name!(), " (name) VALUES (?)");

/// Whether the migrations table exists yet — the readiness probe the database module runs
/// before it will treat a pool as usable.
pub const TABLE_EXISTS: &str = concat!(
    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='",
    table_name!(),
    "';"
);

pub async fn create_table(pool: &Pool<Sqlite>) -> Result<(), Error> {
    sqlx::query(CREATE_TABLE).execute(pool).await?;

    Ok(())
}

pub async fn run(pool: &Pool<Sqlite>, migrations_dir: &PathBuf) -> Result<(), Error> {
    diagnostics::info("migration.started").write();

    create_table(pool).await?;

    let migration_files = get_migration_files(migrations_dir)?;
    let mut migrations_count = 0;

    for file in migration_files {
        let file_name = file.clone();
        let migration_path = migrations_dir.join(&file);
        let sql = fs::read_to_string(&migration_path).map_err(|e| Error::Io {
            message: format!(
                "failed to read migration {}: {}",
                migration_path.display(),
                e
            ),
        })?;

        if is_migration_applied(pool, &file_name).await? {
            continue;
        }

        migrations_count += 1;

        if let Err(err) = apply_migration(pool, &file_name, &sql).await {
            diagnostics::error("migration.failed")
                .with("file", file_name.as_str())
                .with("error", err.to_string())
                .write();

            return Err(err);
        }

        diagnostics::info("migration.applied")
            .with("file", file_name.as_str())
            .write();
    }

    diagnostics::info("migration.completed")
        .with("applied", migrations_count.to_string())
        .write();

    Ok(())
}

fn get_migration_files(migrations_dir: &PathBuf) -> Result<Vec<String>, Error> {
    let path = Path::new(migrations_dir);

    if !path.exists() {
        return Err(Error::NotFound {
            message: format!("migration folder not found: {}", migrations_dir.display()),
        });
    }

    let mut files: Vec<String> = fs::read_dir(path)?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension()?.to_str()? == "sql" {
                Some(path.file_name()?.to_string_lossy().to_string())
            } else {
                None
            }
        })
        .collect();

    files.sort();

    Ok(files)
}

async fn is_migration_applied(pool: &Pool<Sqlite>, name: &str) -> Result<bool, Error> {
    let res: Option<(i64,)> = sqlx::query_as(SELECT_APPLIED)
        .bind(name)
        .fetch_optional(pool)
        .await?;

    Ok(res.is_some())
}

async fn apply_migration(pool: &Pool<Sqlite>, name: &str, sql: &str) -> Result<(), Error> {
    let dialect = SQLiteDialect {};
    let statements = Parser::parse_sql(&dialect, sql).map_err(|e| Error::Integrity {
        message: e.to_string(),
    })?;

    let mut tx = pool.begin().await?;

    for statement in statements {
        // Asserted safe: the text is a migration file shipped with the application,
        // re-emitted by the parser above rather than assembled from any input.
        let sql_str = AssertSqlSafe(statement.to_string());
        sqlx::query(sql_str)
            .execute(&mut *tx)
            .await
            .map_err(|e| Error::Database {
                message: format!("{}: {}", name, e),
            })?;
    }

    sqlx::query(INSERT_APPLIED)
        .bind(name)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use sqlx::{
        AssertSqlSafe, Pool, Sqlite,
        sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    };
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::run;
    use crate::error::Error;

    /// The file the identity change ships as. Named once, because three tests build a
    /// workspace as it stood before it.
    const IDENTITY_MIGRATION: &str = "0003_serious_synch.sql";

    /// One connection, because every connection to an in-memory database gets a database of
    /// its own — a pool of two would migrate one and assert against the other.
    async fn memory_pool() -> Pool<Sqlite> {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().in_memory(true))
            .await
            .expect("in-memory pool")
    }

    /// The migration directory the application ships, resolved from the crate root rather
    /// than from the working directory — `pnpm test:rust` runs cargo from `apps/desktop`.
    fn shipped_migrations() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations")
    }

    fn unique_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();

        std::env::temp_dir()
            .join("rentable-tests")
            .join(format!("{}-{}", name, nanos))
    }

    /// A directory holding exactly the migrations named and nothing else, for the cases that
    /// need a file the application does not ship.
    fn authored_migrations(name: &str, files: &[(&str, &str)]) -> PathBuf {
        let dir = unique_dir(name);

        fs::create_dir_all(&dir).expect("failed to create migration directory");

        for (file, sql) in files {
            fs::write(dir.join(file), sql).expect("failed to write migration");
        }

        dir
    }

    async fn applied(pool: &Pool<Sqlite>) -> Vec<(i64, String)> {
        sqlx::query_as("SELECT id, name FROM __migrations__ ORDER BY id")
            .fetch_all(pool)
            .await
            .expect("failed to read applied migrations")
    }

    /// The `.sql` files in a directory, listed and sorted here rather than through
    /// `get_migration_files` — using the function under test to compute the expectation would
    /// let a file it silently dropped disappear from both sides of the assertion.
    fn sql_files(dir: &PathBuf) -> Vec<String> {
        let mut files: Vec<String> = fs::read_dir(dir)
            .expect("failed to list the migration directory")
            .map(|entry| entry.expect("failed to read a directory entry").path())
            .filter(|path| path.extension().is_some_and(|ext| ext == "sql"))
            .map(|path| {
                path.file_name()
                    .expect("a file should have a name")
                    .to_string_lossy()
                    .to_string()
            })
            .collect();

        files.sort();

        files
    }

    async fn table_exists(pool: &Pool<Sqlite>, table: &str) -> bool {
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?;")
                .bind(table)
                .fetch_one(pool)
                .await
                .expect("failed to read sqlite_master");

        count == 1
    }

    /// The shipped migrations apply through `run` itself, and what reaches the engine is the
    /// parser's re-emission rather than the file's own text.
    ///
    /// The distinction is the reason this test exists at all. `apply_migration` parses the
    /// whole file and executes each statement rendered back out through `Display`, so a test
    /// that handed the SQL straight to the pool would exercise a path the application does
    /// not have. `sqlite_master` is what tells the two apart: it stores each `CREATE` as it
    /// was executed, and the shipped file declares `complex` over five lines with a lowercase
    /// type where the re-emission is one line with an uppercase one.
    #[tokio::test]
    async fn run_applies_the_shipped_migrations_as_the_parser_re_emits_them() {
        let pool = memory_pool().await;

        run(&pool, &shipped_migrations())
            .await
            .expect("the shipped migrations should apply");

        let recorded = applied(&pool)
            .await
            .into_iter()
            .map(|(_, name)| name)
            .collect::<Vec<_>>();

        assert_eq!(
            recorded,
            sql_files(&shipped_migrations()),
            "every shipped migration should be recorded, in the order the runner sorts them"
        );

        // Named rather than counted, so the assertion says which files it means — and
        // matched as a prefix, so the migration #541 adds extends this list instead of
        // rewriting it. Acceptance criterion 12 asserts these tests pass *unchanged*, which
        // an expectation spelled out in full would make impossible to keep.
        assert!(
            recorded.starts_with(&[
                "0000_parched_runaways.sql".to_string(),
                "0001_perpetual_molly_hayes.sql".to_string(),
                "0002_puzzling_sunfire.sql".to_string(),
            ]),
            "the migrations this repository ships today should be the first three applied, got: {recorded:?}"
        );

        for table in [
            "complex",
            "contract",
            "contract_unit",
            "history",
            "payment",
            "tenant",
            "unit",
        ] {
            assert!(
                table_exists(&pool, table).await,
                "{table} should exist once the migrations have run"
            );
        }

        // 0001 is the only `ALTER TABLE` file, and preparing a statement over the columns it
        // adds is what proves it ran rather than being skipped as unparseable.
        sqlx::query("SELECT paid_amount, expected_amount FROM contract;")
            .fetch_optional(&pool)
            .await
            .expect("0001's added columns should exist");

        let stored: String =
            sqlx::query_scalar("SELECT sql FROM sqlite_master WHERE name='complex';")
                .fetch_one(&pool)
                .await
                .expect("failed to read the stored statement");

        assert!(
            !stored.contains('\n'),
            "the engine should have seen the parser's single-line rendering, got: {stored}"
        );
        // TEXT since 0003, which is the point rather than an incidental update: this assertion
        // reads the type the engine ended up storing, so the identity migration changing it is
        // the assertion working. What it pins is the normalisation — the parser upper-cases the
        // type it re-emits, whatever that type is.
        assert!(
            stored.contains("`id` TEXT PRIMARY KEY NOT NULL"),
            "the engine should have seen the parser's normalised types, got: {stored}"
        );
    }

    /// A second run over an already-migrated database applies nothing.
    ///
    /// The count the runner reports reaches diagnostics only — `migration.completed` carries
    /// `applied`, and nothing installs a log under test — so what is asserted here is the
    /// effect rather than the line. It is the stronger reading in any case: `0000` opens with
    /// a bare `CREATE TABLE`, so a file applied twice would fail rather than pass quietly,
    /// and `__migrations__` is `AUTOINCREMENT`, so a re-recorded row could not reuse its id.
    #[tokio::test]
    async fn a_second_run_applies_nothing() {
        let pool = memory_pool().await;
        let dir = shipped_migrations();

        run(&pool, &dir).await.expect("the first run should apply");
        let before = applied(&pool).await;

        run(&pool, &dir)
            .await
            .expect("the second run should succeed without applying anything");
        let after = applied(&pool).await;

        assert_eq!(
            before.len(),
            sql_files(&dir).len(),
            "the first run should record every file in the directory"
        );
        assert_eq!(
            before, after,
            "a second run should leave every recorded migration exactly as it was"
        );
    }

    /// A file whose second statement fails leaves the database exactly as it was.
    ///
    /// This is the all-or-nothing property acceptance criterion 1's interruption clause rests
    /// on, and it is a property of *one file*: a file's statements and its `__migrations__`
    /// row commit in a single transaction. A migration split across two files keeps neither
    /// half of that guarantee, and nothing warns.
    #[tokio::test]
    async fn a_file_that_fails_partway_leaves_the_database_untouched() {
        let pool = memory_pool().await;
        let dir = authored_migrations(
            "migrations-partial-failure",
            &[(
                "0000_partial.sql",
                "CREATE TABLE `kept` (`id` integer PRIMARY KEY NOT NULL);--> statement-breakpoint\nINSERT INTO `absent` (`id`) VALUES (1);",
            )],
        );

        let error = run(&pool, &dir)
            .await
            .expect_err("a statement over a table that does not exist should fail the run");

        assert!(
            matches!(error, Error::Database { .. }),
            "a statement the engine rejects is a database error, got {error:?}"
        );
        assert!(
            error.to_string().contains("0000_partial.sql"),
            "the failure should name the file it came from, got: {error}"
        );
        assert!(
            !table_exists(&pool, "kept").await,
            "the statement that succeeded should have been rolled back with the one that did not"
        );
        assert!(
            applied(&pool).await.is_empty(),
            "a file that failed should not be recorded as applied"
        );
    }

    /// A file containing a `PRAGMA` is rejected whole, before any statement runs.
    ///
    /// This is not a curiosity about the parser. `pnpm db:generate` wraps the table-recreate
    /// pattern drizzle-kit emits for a column-type change in `PRAGMA foreign_keys=OFF` and
    /// its matching `ON` — and a column-type change is exactly what the identity migration in
    /// #541 is. Generated output is hand-finished before it ships, and this is what makes
    /// forgetting that a caught mistake rather than a failed release.
    #[tokio::test]
    async fn a_file_containing_a_pragma_is_rejected_before_any_statement_runs() {
        let pool = memory_pool().await;
        let dir = authored_migrations(
            "migrations-pragma",
            &[(
                "0000_pragma.sql",
                "PRAGMA foreign_keys=OFF;--> statement-breakpoint\nCREATE TABLE `never_created` (`id` integer PRIMARY KEY NOT NULL);",
            )],
        );

        let error = run(&pool, &dir)
            .await
            .expect_err("a file the parser rejects should fail the run");

        assert!(
            matches!(error, Error::Integrity { .. }),
            "a file that does not parse is an integrity error, got {error:?}"
        );
        assert!(
            error.to_string().contains("found: OFF"),
            "the failure should carry the parser's own message, got: {error}"
        );
        assert!(
            !table_exists(&pool, "never_created").await,
            "parsing precedes execution, so the statement after the PRAGMA should never have run"
        );
        assert!(
            applied(&pool).await.is_empty(),
            "a file that was never applied should not be recorded as applied"
        );
    }

    /// The bundled engine understands `unixepoch(…, 'subsec')`.
    ///
    /// #541 generates identity values in SQL from that expression, and it needs SQLite 3.42.
    /// The floor is a property of whatever `libsqlite3-sys` compiles in — 0.37.0 today —
    /// rather than something this crate declares, so it is worth one assertion and no
    /// reviewer's memory.
    ///
    /// The lower bound is what does the work, and it is not decoration. An unrecognised
    /// modifier makes SQLite answer `NULL` rather than fail, and `NULL` decodes into an
    /// `f64` as `0` rather than erroring — measured, after this comment first claimed the
    /// decode would catch it. So an engine too old for `subsec` reads as a clock at the
    /// epoch, and only a bound rejects it.
    #[tokio::test]
    async fn the_bundled_engine_supports_subsecond_unixepoch() {
        let pool = memory_pool().await;

        let seconds: f64 = sqlx::query_scalar("SELECT unixepoch('now', 'subsec');")
            .fetch_one(&pool)
            .await
            .expect("the bundled engine should support unixepoch with 'subsec'");

        assert!(
            seconds > 1_700_000_000.0,
            "the clock should read as a unix timestamp in seconds, got {seconds}"
        );
    }

    /// The four shipped files with the last one held back, so a workspace can be populated as
    /// the release before this one left it and then migrated for real.
    ///
    /// It copies rather than filters, because `run` takes a directory: the point of the whole
    /// exercise is that the identity migration meets rows written under the old schema, and a
    /// database built by all four files at once has no such rows.
    fn migrations_before(name: &str, held_back: &str) -> PathBuf {
        let dir = unique_dir(name);

        fs::create_dir_all(&dir).expect("failed to create migration directory");

        for file in sql_files(&shipped_migrations()) {
            if file == held_back {
                continue;
            }

            fs::copy(shipped_migrations().join(&file), dir.join(&file))
                .expect("failed to copy a shipped migration");
        }

        dir
    }

    /// A populated workspace, written with the integer keys the old schema assigned.
    ///
    /// Every reference is exercised, including the two the schema has no constraint for: a
    /// `history` row about a record that no longer exists, and -- deliberately -- a contract
    /// naming a tenant that is not there. Neither is reachable through the application today,
    /// and both are what a file edited by hand or an interrupted delete would leave behind.
    async fn populate_as_the_old_schema(pool: &Pool<Sqlite>) {
        for statement in [
            "INSERT INTO tenant (id, national_id, name, phone) VALUES \
             (1,'1000000001','Aisha','+966500000001'),(2,'1000000002','Bandar','+966500000002')",
            "INSERT INTO complex (id, name, location) VALUES (1,'Al Nakheel','Riyadh'),(2,'Al Waha','Jeddah')",
            "INSERT INTO unit (id, name, status, complex_id) VALUES \
             (1,'A1','occupied',1),(2,'A2','vacant',1),(3,'B1','vacant',2)",
            "INSERT INTO contract (id, gov_id, status, start_date, end_date, interval_in_months, \
             cost_per_interval, paid_amount, expected_amount, tenant_id) VALUES \
             (1,'GOV-1','active',1700000000000,1731000000000,'12m',1000.0,1000.0,1000.0,1), \
             (2,NULL,'expired',1600000000000,1631000000000,'6m',500.0,0.0,500.0,2), \
             (3,'GOV-3','active',1700000000000,1731000000000,'1m',100.0,0.0,100.0,99)",
            "INSERT INTO contract_unit (contract_id, unit_id) VALUES (1,1),(2,2),(3,3)",
            "INSERT INTO payment (id, date, amount, contract_id) VALUES \
             (1,1700000000000,600.0,1),(2,1700100000000,400.0,1)",
            "INSERT INTO history (id, at, concept, record_id, action, record) VALUES \
             (1,1700000000000,'tenant',1,'created','Aisha'), \
             (2,1700000000001,'contract',1,'created','GOV-1'), \
             (3,1700000000002,'tenant',77,'created','Ghost'), \
             (4,1700000000003,'tenant',77,'deleted','Ghost')",
        ] {
            sqlx::query(AssertSqlSafe(statement.to_string()))
                .execute(pool)
                .await
                .expect("the fixture should insert");
        }
    }

    async fn ids(pool: &Pool<Sqlite>, sql: &str) -> Vec<String> {
        sqlx::query_scalar(AssertSqlSafe(sql.to_string()))
            .fetch_all(pool)
            .await
            .expect("failed to read identities")
    }

    async fn count(pool: &Pool<Sqlite>, sql: &str) -> i64 {
        sqlx::query_scalar(AssertSqlSafe(sql.to_string()))
            .fetch_one(pool)
            .await
            .expect("failed to count")
    }

    /// A workspace populated under the old schema, migrated for real.
    async fn migrated_workspace(name: &str) -> Pool<Sqlite> {
        let pool = memory_pool().await;

        run(&pool, &migrations_before(name, IDENTITY_MIGRATION))
            .await
            .expect("the migrations before the identity change should apply");

        populate_as_the_old_schema(&pool).await;

        run(&pool, &shipped_migrations())
            .await
            .expect("the identity migration should apply over populated rows");

        pool
    }

    /// A populated workspace crosses the identity migration with every row and every reference
    /// intact.
    ///
    /// This is acceptance criterion 1's automatable half. The criterion itself is an install
    /// and an update on a real machine; what can be pinned here is the part that would fail
    /// silently -- a reference remapped to nothing, or a row quietly dropped by a join. There
    /// is not one foreign key in this schema, so nothing but this test would object.
    #[tokio::test]
    async fn a_populated_workspace_crosses_the_identity_migration_whole() {
        let pool = migrated_workspace("crosses-whole").await;

        // counted per concept rather than spot-checked: a join that dropped rows is exactly
        // the failure this migration is capable of, and it leaves a smaller table behind.
        for (table, expected) in [
            ("tenant", 2),
            ("complex", 2),
            ("unit", 3),
            ("contract", 3),
            ("contract_unit", 3),
            ("payment", 2),
            ("history", 4),
        ] {
            assert_eq!(
                count(&pool, &format!("SELECT count(*) FROM {table}")).await,
                expected,
                "{table} should carry every row it had before the migration"
            );
        }

        assert!(
            !table_exists(&pool, "idmap").await,
            "the identity map should not survive the migration that built it"
        );

        // every reference resolves. An inner join returning fewer rows than the table holds is
        // a reference that now points at nothing.
        for (query, expected, what) in [
            (
                "SELECT count(*) FROM contract c JOIN tenant t ON t.id = c.tenant_id",
                2,
                "every contract naming a tenant that exists should still name it",
            ),
            (
                "SELECT count(*) FROM unit u JOIN complex c ON c.id = u.complex_id",
                3,
                "every unit should still name its complex",
            ),
            (
                "SELECT count(*) FROM contract_unit a JOIN contract c ON c.id = a.contract_id \
                 JOIN unit u ON u.id = a.unit_id",
                3,
                "every assignment should still name its contract and its unit",
            ),
            (
                "SELECT count(*) FROM payment p JOIN contract c ON c.id = p.contract_id",
                2,
                "every payment should still name its contract",
            ),
            (
                "SELECT count(*) FROM history h JOIN tenant t ON t.id = h.record_id \
                 WHERE h.concept = 'tenant'",
                1,
                "a history entry about a live tenant should still name it",
            ),
        ] {
            assert_eq!(count(&pool, query).await, expected, "{what}");
        }

        // the deleted tenant has no row to map from, so its identity is minted from `history`
        // itself -- once for the record, not once per entry, or two entries about one deletion
        // would stop being about the same thing.
        let orphaned = ids(
            &pool,
            "SELECT record_id FROM history WHERE record = 'Ghost' ORDER BY at",
        )
        .await;

        assert_eq!(
            orphaned.len(),
            2,
            "both entries about the deleted tenant should survive"
        );
        assert_eq!(
            orphaned[0], orphaned[1],
            "two entries about one deleted record should point at one identity, got {orphaned:?}"
        );
        assert_eq!(
            count(
                &pool,
                &format!("SELECT count(*) FROM tenant WHERE id = '{}'", orphaned[0])
            )
            .await,
            0,
            "the deleted tenant's minted identity should not collide with a live row"
        );
    }

    /// Every migrated identity is a well-formed UUIDv7, and no two rows share one.
    ///
    /// The grammar is checked rather than assumed because the values are built by `printf` in
    /// SQL: a format string that lost a digit would still produce a string, and a string is
    /// all a `TEXT` column asks for. Distinctness spans the concepts as well as each one --
    /// they share an identity space the moment two workspaces meet, which is the whole reason
    /// for the change.
    #[tokio::test]
    async fn every_migrated_identity_is_a_distinct_well_formed_uuid7() {
        let pool = migrated_workspace("uuid-grammar").await;
        let mut all = Vec::new();

        for table in [
            "tenant", "complex", "unit", "contract", "payment", "history",
        ] {
            let rows = ids(&pool, &format!("SELECT id FROM {table}")).await;

            for id in &rows {
                let bytes = id.as_bytes();

                assert_eq!(id.len(), 36, "{table} {id} should be 36 characters");
                assert!(
                    [8, 13, 18, 23].iter().all(|at| bytes[*at] == b'-'),
                    "{table} {id} should carry its hyphens where a UUID does"
                );
                assert!(
                    id.chars()
                        .enumerate()
                        .all(|(at, c)| [8, 13, 18, 23].contains(&at)
                            || (c.is_ascii_hexdigit() && !c.is_ascii_uppercase())),
                    "{table} {id} should be lowercase hex outside its hyphens"
                );
                assert_eq!(bytes[14], b'7', "{table} {id} should declare version 7");
                assert!(
                    b"89ab".contains(&bytes[19]),
                    "{table} {id} should carry the RFC 9562 variant"
                );
            }

            all.extend(rows);
        }

        let distinct: std::collections::HashSet<&String> = all.iter().collect();

        assert_eq!(
            distinct.len(),
            all.len(),
            "no two migrated records should share an identity, across concepts as well as within one"
        );
    }

    /// Migrated rows come back in the order their rowids had.
    ///
    /// Every row that exists at migration time shares one 48-bit timestamp, so the order is
    /// decided by everything after it -- and `contract/router.ts` orders the palette's contract
    /// search by `desc(contract.id)` alone, with no second column to fall back on. Seeding the
    /// value from the old id is what makes this hold, and a form that randomised any field
    /// above the seed would fail here rather than in front of a reader.
    #[tokio::test]
    async fn migrated_rows_keep_the_order_their_row_ids_had() {
        let pool = memory_pool().await;

        run(
            &pool,
            &migrations_before("migrated-order", IDENTITY_MIGRATION),
        )
        .await
        .expect("the earlier migrations should apply");

        // enough rows that an order preserved by luck would have to be very lucky
        for chunk in 0..20 {
            let values: Vec<String> = (0..50)
                .map(|row| {
                    let id = chunk * 50 + row + 10;
                    format!("({id},'C{id}','Riyadh')")
                })
                .collect();

            sqlx::query(AssertSqlSafe(format!(
                "INSERT INTO complex (id, name, location) VALUES {}",
                values.join(",")
            )))
            .execute(&pool)
            .await
            .expect("the fixture should insert");
        }

        run(&pool, &shipped_migrations())
            .await
            .expect("the identity migration should apply");

        // the name carries the old id, so the two orders can be compared without keeping a
        // mapping the migration deliberately destroys
        let by_identity = ids(&pool, "SELECT name FROM complex ORDER BY id").await;
        let by_old_id = ids(
            &pool,
            "SELECT name FROM complex ORDER BY CAST(substr(name, 2) AS INTEGER)",
        )
        .await;

        assert_eq!(
            by_identity.len(),
            1000,
            "every row should have been migrated"
        );
        assert_eq!(
            by_identity, by_old_id,
            "ordering by the new identity should give the order the rowids had"
        );
    }
}
