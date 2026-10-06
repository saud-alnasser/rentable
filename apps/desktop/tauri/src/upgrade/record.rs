//! the records an earlier version kept, read as the whole-workspace export (effort 838,
//! requirement 18, ticket 36).
//!
//! *It was `earlier.rs` until effort 840 (ticket 48) put it here, with everything else that brings
//! an older install forward. The commands keep their names, `earlier_find` and `earlier_read`,
//! served by the `upgrade` plugin: `upgrade_earlier_find` is invoked as
//! `plugin:upgrade|earlier_find`.*
//!
//! **0.12.0 and 0.13.0 kept every record in `app.db`**, one plain SQLite file on the machine,
//! migrated by the application itself with a ledger of its own, `__migrations__`, naming each
//! migration file it applied. This build keeps records in a workspace replica and never reads
//! that file, so a person updating from either would find nothing. Nothing migrates it in place:
//! the file is read as the whole-workspace export is, written out as that export's workbook under
//! `backups/app/` so the person keeps it, and the interface brings it in through the workspace
//! import it already has, as though the person had chosen that file.
//!
//! **Nothing here writes to `app.db`.** It is opened read-only and never created, so a machine
//! that has no such file is not given one, and the file an earlier version left is exactly the
//! file it left.
//!
//! **The tables are the workbook read back**, through the reader `import_read_book` is, rather
//! than built beside it. What the interface is handed is then what it would have been handed had
//! the person chosen the workbook themselves, and there is no second spelling of a date or an
//! amount for the two to disagree over. The sheets are the ones the record features declare to
//! `src/lib/transfer/` (each feature's `transfer.ts`), in their order, and
//! `src/lib/workspace/tests/app-database.json` is what a test on each side holds them to.
//!
//! **A record whose parent is missing is left out, and counted.** A unit whose complex, a contract
//! whose tenant, or a payment whose contract is not in the file has nothing the import could
//! attach it to, and the import refuses a whole file over a reference nothing answers to, so the
//! read leaves it out as `transfer.get` does. A contract's link to a unit that is missing, or was
//! itself left out, goes the same way, and the unit is not on the contract's row. How many of
//! each were left out is written in the `earlier.read` line, which is a warning where any was, so
//! the records a person does not find brought over are accounted for somewhere.

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use chrono::DateTime;
use sqlx::{ConnectOptions, Connection, SqliteConnection, sqlite::SqliteConnectOptions};
use tauri::State;

use crate::{
    backup,
    diagnostics::{self, DiagnosticRecord},
    error::Error,
    settings,
    transfer::{
        export::{self, Cell, Sheet},
        import::{self, Table},
    },
};

/// What the copies of `app.db` are filed under, beside the organization's and the workspaces'.
const DATABASE_NAME: &str = "app";

/// The migrations 0.12.0 shipped, as its runner recorded them in `__migrations__`.
const SCHEMA_2: &[&str] = &[
    "0000_parched_runaways.sql",
    "0001_perpetual_molly_hayes.sql",
];

/// The migrations 0.13.0 shipped: 0.12.0's, and the history table.
const SCHEMA_3: &[&str] = &[
    "0000_parched_runaways.sql",
    "0001_perpetual_molly_hayes.sql",
    "0002_puzzling_sunfire.sql",
];

/// Which earlier version left the file, told by the migrations it recorded.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub enum Version {
    /// workspace schema 2: the five concepts and a contract's paid and expected amounts.
    #[serde(rename = "0.12.0")]
    Twelve,
    /// workspace schema 3: schema 2 and the history of what was done to each record.
    #[serde(rename = "0.13.0")]
    Thirteen,
}

impl Version {
    /// The version as a release names it, which is also how its workbook is named.
    pub fn name(self) -> &'static str {
        match self {
            Version::Twelve => "0.12.0",
            Version::Thirteen => "0.13.0",
        }
    }

    /// The version whose runner recorded exactly `applied`, or nothing.
    ///
    /// Exactly, and not at least: a file that recorded more than 0.13.0 shipped was carried on by
    /// something this does not know the shape of, and one that recorded less never reached the
    /// schema a contract's amounts arrived in.
    fn of(applied: &[String]) -> Option<Self> {
        if applied.iter().eq(SCHEMA_2.iter()) {
            Some(Version::Twelve)
        } else if applied.iter().eq(SCHEMA_3.iter()) {
            Some(Version::Thirteen)
        } else {
            None
        }
    }
}

/// An earlier version's records, found in `app.db`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub struct Found {
    pub version: Version,
}

/// An earlier version's records, read.
#[derive(serde::Serialize)]
pub struct Read {
    pub version: Version,
    /// where the workbook was written, which is the file the person keeps.
    pub path: String,
    /// the workbook's sheets, as `import_read_book` hands a chosen file over.
    pub tables: Vec<Table>,
}

/// Open `path` for reading and nothing else, or answer nothing where there is no file.
///
/// `read_only` rather than `immutable`: an earlier version that did not close cleanly left the
/// last of its writes in the write-ahead log beside the file, and an immutable open would read
/// past them. The cost is that SQLite makes that log and its index beside the file where they
/// are missing, empty, as this build's own plain pool over `app.db` does when it opens it; the
/// file itself is not written.
async fn open(path: &Path) -> Result<Option<SqliteConnection>, Error> {
    if !path.is_file() {
        return Ok(None);
    }

    let connection = SqliteConnectOptions::new()
        .filename(path)
        .read_only(true)
        .create_if_missing(false)
        .connect()
        .await?;

    Ok(Some(connection))
}

/// Which earlier version wrote what `connection` holds, where one did and it holds a record.
async fn version_of(connection: &mut SqliteConnection) -> Result<Option<Version>, Error> {
    let (ledger,): (i64,) = sqlx::query_as(
        "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = '__migrations__'",
    )
    .fetch_one(&mut *connection)
    .await?;

    // this build and 0.14.0 open `app.db` without migrating it, so the file they made has no
    // ledger at all.
    if ledger == 0 {
        return Ok(None);
    }

    let applied: Vec<String> =
        sqlx::query_scalar("SELECT CAST(name AS TEXT) FROM __migrations__ ORDER BY name")
            .fetch_all(&mut *connection)
            .await?;

    let Some(version) = Version::of(&applied) else {
        return Ok(None);
    };

    // a file an earlier version made and nobody wrote a record into has nothing to bring over.
    let (records,): (i64,) = sqlx::query_as(
        "SELECT (SELECT count(*) FROM tenant) + (SELECT count(*) FROM complex) \
         + (SELECT count(*) FROM unit) + (SELECT count(*) FROM contract) \
         + (SELECT count(*) FROM payment)",
    )
    .fetch_one(&mut *connection)
    .await?;

    Ok((records > 0).then_some(version))
}

/// Whether the file at `path` holds records of an earlier version, and which.
pub async fn find(path: &Path) -> Result<Option<Found>, Error> {
    let Some(mut connection) = open(path).await? else {
        return Ok(None);
    };

    let version = version_of(&mut connection).await;

    connection.close().await?;

    Ok(version?.map(|version| Found { version }))
}

/// A cell of text.
fn text(value: impl Into<String>) -> Cell {
    Cell::Text {
        value: value.into(),
    }
}

/// An amount of money.
fn money(value: f64) -> Cell {
    Cell::Money { value }
}

/// The day `milliseconds` falls on, as the count of days the spreadsheet format counts in:
/// `toSerialDay` in `@rentable/design/csv.js`, which is what the export's own days are.
fn day(milliseconds: i64) -> Cell {
    /// 1899-12-30, the day serial zero is, in unix milliseconds.
    const SPREADSHEET_EPOCH: f64 = -2_209_161_600_000.0;
    const MILLISECONDS_A_DAY: f64 = 86_400_000.0;

    Cell::Date {
        value: (milliseconds as f64 - SPREADSHEET_EPOCH) / MILLISECONDS_A_DAY,
    }
}

/// The day `milliseconds` falls on in UTC, as `toIsoDay` spells it.
fn iso_day(milliseconds: i64) -> String {
    DateTime::from_timestamp_millis(milliseconds)
        .map(|moment| moment.format("%Y-%m-%d").to_string())
        .unwrap_or_default()
}

/// What a file calls one contract: `toContractReference`. The government number where it has
/// one, and otherwise its tenant and the day its term started.
fn contract_reference(government_id: Option<&str>, tenant: &str, start: i64) -> String {
    match government_id
        .map(str::trim)
        .filter(|stated| !stated.is_empty())
    {
        Some(stated) => stated.to_owned(),
        None => format!("{} @ {}", tenant.trim(), iso_day(start)),
    }
}

/// A contract as [`contract_references`] reads it: its id, government number, tenant, start and
/// end.
type ContractNaming<'a> = (i64, Option<&'a str>, &'a str, i64, i64);

/// What a file calls each contract of a set, by its id: `toContractReferences`. Each is
/// [`contract_reference`], except that numberless contracts sharing a tenant and a start add the
/// day their term ends, and those sharing that day too add an ordinal counted in order of id. So a
/// legacy workspace holding such a pair writes a workbook whose payments each name their own
/// contract, and the import refuses no row of it as a collision.
fn contract_references(contracts: &[ContractNaming<'_>]) -> HashMap<i64, String> {
    let mut references = HashMap::new();
    let mut sharing: HashMap<String, Vec<(i64, i64)>> = HashMap::new();

    for &(id, government_id, tenant, start, end) in contracts {
        let reference = contract_reference(government_id, tenant, start);

        if government_id.map(str::trim).unwrap_or_default().is_empty() {
            sharing
                .entry(reference.to_lowercase())
                .or_default()
                .push((id, end));
        }

        references.insert(id, reference);
    }

    for group in sharing.values().filter(|group| group.len() > 1) {
        let mut ending: HashMap<String, Vec<i64>> = HashMap::new();

        for &(id, end) in group {
            let reference = format!("{}..{}", references[&id], iso_day(end));

            ending.entry(reference.clone()).or_default().push(id);
            references.insert(id, reference);
        }

        for (reference, mut same) in ending.into_iter().filter(|(_, same)| same.len() > 1) {
            same.sort_unstable();

            for (index, id) in same.into_iter().enumerate() {
                references.insert(id, format!("{reference} #{}", index + 1));
            }
        }
    }

    references
}

/// What a file calls one unit: `toUnitReference`, its complex and its own name.
fn unit_reference(complex: &str, unit: &str) -> String {
    format!("{} / {}", complex.trim(), unit.trim())
}

/// One sheet under the tab the transfer writes it under.
fn sheet(name: &str, headers: &[&str], rows: Vec<Vec<Cell>>) -> Sheet {
    Sheet {
        name: Some(name.to_owned()),
        headers: headers.iter().map(|header| (*header).to_owned()).collect(),
        rows,
    }
}

/// How many records of each kind the read left out for a parent the file does not hold.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct LeftOut {
    /// units whose complex is missing.
    units: usize,
    /// contracts whose tenant is missing.
    contracts: usize,
    /// payments whose contract is missing, or was itself left out.
    payments: usize,
    /// a contract's links to a unit that is missing, or was itself left out.
    unit_links: usize,
}

impl LeftOut {
    fn any(self) -> bool {
        self.units + self.contracts + self.payments + self.unit_links > 0
    }
}

/// The five sheets of the whole-workspace export, read out of what 0.12.0 or 0.13.0 left.
///
/// **The same statements at both versions.** Schema 3 added only `history`, and the export has no
/// sheet for it: the history of a record is not something a workspace hands over. Each read is
/// ordered as `transfer.get` orders it, and each value is cast to what the export writes, so a
/// value an earlier version happened to store in another storage class still reads.
///
/// The joins leave out a record whose parent is missing; how many of each is counted beside the
/// sheets ([`LeftOut`]).
async fn sheets(connection: &mut SqliteConnection) -> Result<(Vec<Sheet>, LeftOut), Error> {
    let tenants: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT CAST(name AS TEXT), CAST(national_id AS TEXT), CAST(phone AS TEXT) \
         FROM tenant ORDER BY name, id",
    )
    .fetch_all(&mut *connection)
    .await?;

    let complexes: Vec<(String, String)> = sqlx::query_as(
        "SELECT CAST(name AS TEXT), CAST(location AS TEXT) FROM complex ORDER BY name, id",
    )
    .fetch_all(&mut *connection)
    .await?;

    let units: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT CAST(complex.name AS TEXT), CAST(unit.name AS TEXT), CAST(unit.status AS TEXT) \
         FROM unit JOIN complex ON unit.complex_id = complex.id \
         ORDER BY complex.name, unit.name, unit.id",
    )
    .fetch_all(&mut *connection)
    .await?;

    #[allow(clippy::type_complexity)]
    let contracts: Vec<(
        i64,
        Option<String>,
        String,
        i64,
        i64,
        String,
        f64,
        String,
        f64,
        f64,
    )> = sqlx::query_as(
        "SELECT contract.id, CAST(contract.gov_id AS TEXT), CAST(tenant.national_id AS TEXT), \
             CAST(contract.start_date AS INTEGER), CAST(contract.end_date AS INTEGER), \
             CAST(contract.interval_in_months AS TEXT), CAST(contract.cost_per_interval AS REAL), \
             CAST(contract.status AS TEXT), CAST(contract.paid_amount AS REAL), \
             CAST(contract.expected_amount AS REAL) \
             FROM contract JOIN tenant ON contract.tenant_id = tenant.id \
             ORDER BY contract.start_date, contract.id",
    )
    .fetch_all(&mut *connection)
    .await?;

    let assignments: Vec<(i64, String, String)> = sqlx::query_as(
        "SELECT contract_unit.contract_id, CAST(complex.name AS TEXT), CAST(unit.name AS TEXT) \
         FROM contract_unit JOIN unit ON contract_unit.unit_id = unit.id \
         JOIN complex ON unit.complex_id = complex.id \
         ORDER BY complex.name, unit.name",
    )
    .fetch_all(&mut *connection)
    .await?;

    let payments: Vec<(i64, f64, i64)> = sqlx::query_as(
        "SELECT CAST(date AS INTEGER), CAST(amount AS REAL), contract_id FROM payment \
         ORDER BY date, id",
    )
    .fetch_all(&mut *connection)
    .await?;

    let (all_units, all_contracts, all_unit_links): (i64, i64, i64) = sqlx::query_as(
        "SELECT (SELECT count(*) FROM unit), (SELECT count(*) FROM contract), \
         (SELECT count(*) FROM contract_unit)",
    )
    .fetch_one(&mut *connection)
    .await?;
    let unit_links_read = assignments.len();
    let all_payments = payments.len();

    let mut units_of: HashMap<i64, Vec<String>> = HashMap::new();

    for (contract, complex, unit) in &assignments {
        units_of
            .entry(*contract)
            .or_default()
            .push(unit_reference(complex, unit));
    }

    let reference_of = contract_references(
        &contracts
            .iter()
            .map(|(id, government_id, tenant, start, end, ..)| {
                (*id, government_id.as_deref(), tenant.as_str(), *start, *end)
            })
            .collect::<Vec<_>>(),
    );

    let contract_rows = contracts
        .iter()
        .map(
            |(id, _, tenant, start, end, interval, cost, status, paid, expected)| {
                let held = units_of
                    .get(id)
                    .map(|held| held.join("; "))
                    .unwrap_or_default();

                vec![
                    text(reference_of[id].as_str()),
                    text(tenant.as_str()),
                    text(held),
                    day(*start),
                    day(*end),
                    text(interval.as_str()),
                    money(*cost),
                    text(status.as_str()),
                    money(*paid),
                    money(*expected),
                ]
            },
        )
        .collect();

    let units_read = units.len();
    let contracts_read = contracts.len();

    // a payment whose contract is gone is left out, as `transfer.get` leaves it out: the import
    // refuses a whole file over a reference nothing answers to.
    let payment_rows: Vec<Vec<Cell>> = payments
        .into_iter()
        .filter_map(|(date, amount, contract)| {
            reference_of
                .get(&contract)
                .map(|reference| vec![text(reference.as_str()), day(date), money(amount)])
        })
        .collect();

    let left_out = LeftOut {
        units: usize::try_from(all_units)
            .unwrap_or_default()
            .saturating_sub(units_read),
        contracts: usize::try_from(all_contracts)
            .unwrap_or_default()
            .saturating_sub(contracts_read),
        payments: all_payments - payment_rows.len(),
        unit_links: usize::try_from(all_unit_links)
            .unwrap_or_default()
            .saturating_sub(unit_links_read),
    };

    let sheets = vec![
        sheet(
            "Tenants",
            &["Name", "National ID", "Phone"],
            tenants
                .into_iter()
                .map(|(name, national_id, phone)| vec![text(name), text(national_id), text(phone)])
                .collect(),
        ),
        sheet(
            "Complexes",
            &["Name", "Location"],
            complexes
                .into_iter()
                .map(|(name, location)| vec![text(name), text(location)])
                .collect(),
        ),
        sheet(
            "Units",
            &["Complex", "Unit", "Status"],
            units
                .into_iter()
                .map(|(complex, name, status)| vec![text(complex), text(name), text(status)])
                .collect(),
        ),
        sheet(
            "Contracts",
            &[
                "Contract", "Tenant", "Units", "Start", "End", "Interval", "Cost", "Status",
                "Paid", "Expected",
            ],
            contract_rows,
        ),
        sheet("Payments", &["Contract", "Date", "Amount"], payment_rows),
    ];

    Ok((sheets, left_out))
}

/// The line the log keeps of a read: the version, the workbook, and how many records of each kind
/// were left out for a missing parent, as a warning where any was.
fn read_record(version: Version, workbook: &str, left_out: LeftOut) -> DiagnosticRecord {
    let record = if left_out.any() {
        diagnostics::warn("earlier.read")
    } else {
        diagnostics::info("earlier.read")
    };

    record
        .with("version", version.name())
        .with("workbook", workbook)
        .with("unitsLeftOut", left_out.units.to_string())
        .with("contractsLeftOut", left_out.contracts.to_string())
        .with("paymentsLeftOut", left_out.payments.to_string())
        .with("unitLinksLeftOut", left_out.unit_links.to_string())
}

/// Where the workbook of `version`'s records is written, under `directory`, the directory
/// `app.db` sits in, which is where every copy on this machine is kept.
pub fn workbook_path(directory: &Path, version: Version) -> PathBuf {
    backup::directory_of(directory, DATABASE_NAME)
        .join(format!("workspace-{}.xlsx", version.name()))
}

/// Read the records of an earlier version out of the file at `path`, write them as the export
/// workbook beside the other copies, and hand back the workbook's tables.
///
/// A file holding no such records is refused, and nothing is written.
pub async fn read(path: &Path) -> Result<Read, Error> {
    let not_found = || Error::NotFound {
        message: format!("{} holds no records of an earlier version", path.display()),
    };

    let mut connection = open(path).await?.ok_or_else(not_found)?;

    // one read, so the five sheets are of one moment.
    let answered = async {
        let mut transaction = connection.begin().await?;
        let version = version_of(&mut transaction).await?;
        let sheets = match version {
            Some(version) => Some((version, sheets(&mut transaction).await?)),
            None => None,
        };

        transaction.rollback().await?;

        Ok::<_, Error>(sheets)
    }
    .await;

    connection.close().await?;

    let (version, (sheets, left_out)) = answered?.ok_or_else(not_found)?;
    let directory = path.parent().unwrap_or_else(|| Path::new("."));
    let workbook = workbook_path(directory, version);

    if let Some(parent) = workbook.parent() {
        std::fs::create_dir_all(parent).map_err(|error| Error::Io {
            message: format!("could not create {}: {error}", parent.display()),
        })?;
    }

    let written =
        export::export_write_workbook(workbook.to_string_lossy().into_owned(), sheets).await?;
    let tables = import::import_read_book(written.clone()).await?;

    read_record(version, &written, left_out).write();

    Ok(Read {
        version,
        path: written,
        tables,
    })
}

/// Whether this machine's `app.db` holds the records of an earlier version, and which.
#[tauri::command(rename = "earlier_find")]
pub async fn upgrade_earlier_find(
    settings: State<'_, settings::Shared>,
) -> Result<Option<Found>, Error> {
    let path = settings.read().await.database_path.clone();

    find(&path).await
}

/// Read the records of an earlier version out of this machine's `app.db`, as the export would
/// have written them, and write that workbook under `backups/app/`.
#[tauri::command(rename = "earlier_read")]
pub async fn upgrade_earlier_read(settings: State<'_, settings::Shared>) -> Result<Read, Error> {
    let path = settings.read().await.database_path.clone();

    read(&path).await
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::test::scratch;
    use chrono::NaiveDate;

    /// The migrations 0.12.0 and 0.13.0 shipped, as those releases read them off disk: the same
    /// files, unchanged since, that `packages/workspace-migrations` now holds.
    const SHIPPED: &[(&str, &str)] = &[
        (
            "0000_parched_runaways.sql",
            include_str!(
                "../../../../../packages/workspace-migrations/migrations/0000_parched_runaways.sql"
            ),
        ),
        (
            "0001_perpetual_molly_hayes.sql",
            include_str!(
                "../../../../../packages/workspace-migrations/migrations/0001_perpetual_molly_hayes.sql"
            ),
        ),
        (
            "0002_puzzling_sunfire.sql",
            include_str!(
                "../../../../../packages/workspace-migrations/migrations/0002_puzzling_sunfire.sql"
            ),
        ),
    ];

    /// What each version's records read as: the tables the interface is handed, and the
    /// contract between this suite and `src/lib/workspace/tests/app-database.test.ts`, which plans
    /// an import over the same tables.
    const TABLES: &str = include_str!("../../../src/lib/workspace/tests/app-database.json");

    /// Midnight UTC on the day given, in unix milliseconds, as the earlier versions stored a day.
    fn at(year: i32, month: u32, day: u32) -> i64 {
        NaiveDate::from_ymd_opt(year, month, day)
            .and_then(|date| date.and_hms_opt(0, 0, 0))
            .expect("a day")
            .and_utc()
            .timestamp_millis()
    }

    /// Open `path` to read and write, creating it, as the earlier versions opened it.
    async fn writable(path: &Path) -> SqliteConnection {
        SqliteConnectOptions::new()
            .filename(path)
            .pragma("journal_mode", "WAL")
            .pragma("synchronous", "NORMAL")
            .create_if_missing(true)
            .connect()
            .await
            .expect("the file")
    }

    /// Apply the shipped migrations `names` the way the earlier runner did: its ledger, each
    /// file's statements in one transaction, and the file's name recorded.
    async fn migrate(connection: &mut SqliteConnection, names: &[&str]) {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS __migrations__(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
        )
        .execute(&mut *connection)
        .await
        .expect("the ledger");

        for name in names {
            let sql = SHIPPED
                .iter()
                .find(|(shipped, _)| shipped == name)
                .map(|(_, sql)| *sql)
                .expect("a migration that shipped");
            let mut transaction = connection.begin().await.expect("a migration");

            for statement in sql
                .split("--> statement-breakpoint")
                .map(str::trim)
                .filter(|statement| !statement.is_empty())
            {
                sqlx::query(sqlx::AssertSqlSafe(statement.to_owned()))
                    .execute(&mut *transaction)
                    .await
                    .expect(statement);
            }

            sqlx::query("INSERT INTO __migrations__ (name) VALUES (?)")
                .bind(*name)
                .execute(&mut *transaction)
                .await
                .expect("the ledger's row");
            transaction.commit().await.expect("a migration");
        }
    }

    /// One value bound into a seeding statement.
    enum Value {
        Null,
        Integer(i64),
        Real(f64),
        Text(&'static str),
    }

    const TENANT: &str = "INSERT INTO tenant (id, national_id, name, phone) VALUES (?, ?, ?, ?)";
    const COMPLEX: &str = "INSERT INTO complex (id, name, location) VALUES (?, ?, ?)";
    const UNIT: &str = "INSERT INTO unit (id, name, status, complex_id) VALUES (?, ?, ?, ?)";
    const CONTRACT: &str = "INSERT INTO contract (id, gov_id, status, start_date, end_date, \
         interval_in_months, cost_per_interval, tenant_id, paid_amount, expected_amount) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    const ASSIGNMENT: &str = "INSERT INTO contract_unit (contract_id, unit_id) VALUES (?, ?)";
    const PAYMENT: &str = "INSERT INTO payment (id, date, amount, contract_id) VALUES (?, ?, ?, ?)";

    /// A record of every kind the version held, and the references between them: a tenant and a
    /// complex written in each language, a contract with a government number and one without,
    /// units held and one vacant, three payments, and in 0.13.0 an entry of history.
    async fn records(connection: &mut SqliteConnection, version: Version) {
        use Value::{Integer, Null, Real, Text};

        let rows: Vec<(&str, Vec<Value>)> = vec![
            (
                TENANT,
                vec![
                    Integer(1),
                    Text("1234567890"),
                    Text("Abby Kris"),
                    Text("+966512345678"),
                ],
            ),
            (
                TENANT,
                vec![
                    Integer(2),
                    Text("2234567891"),
                    Text("عمر الحربي"),
                    Text("+966553456789"),
                ],
            ),
            (
                COMPLEX,
                vec![Integer(1), Text("Al Nakheel"), Text("Riyadh")],
            ),
            (COMPLEX, vec![Integer(2), Text("برج الياسمين"), Text("جدة")]),
            (
                UNIT,
                vec![Integer(1), Text("A1"), Text("vacant"), Integer(1)],
            ),
            (
                UNIT,
                vec![Integer(2), Text("A2"), Text("occupied"), Integer(1)],
            ),
            (
                UNIT,
                vec![Integer(3), Text("101"), Text("occupied"), Integer(2)],
            ),
            (
                CONTRACT,
                vec![
                    Integer(1),
                    Text("GOV-1"),
                    Text("expired"),
                    Integer(at(2025, 1, 1)),
                    Integer(at(2026, 1, 1)),
                    Text("12m"),
                    Real(18_000.0),
                    Integer(1),
                    Real(18_000.0),
                    Real(18_000.0),
                ],
            ),
            (
                CONTRACT,
                vec![
                    Integer(2),
                    Null,
                    Text("active"),
                    Integer(at(2026, 3, 1)),
                    Integer(at(2026, 9, 1)),
                    Text("1m"),
                    Real(1_500.5),
                    Integer(2),
                    Real(3_001.0),
                    Real(9_003.0),
                ],
            ),
            (ASSIGNMENT, vec![Integer(1), Integer(2)]),
            (ASSIGNMENT, vec![Integer(2), Integer(3)]),
            (
                PAYMENT,
                vec![
                    Integer(1),
                    Integer(at(2025, 1, 1)),
                    Real(18_000.0),
                    Integer(1),
                ],
            ),
            (
                PAYMENT,
                vec![
                    Integer(2),
                    Integer(at(2026, 3, 1)),
                    Real(1_500.5),
                    Integer(2),
                ],
            ),
            (
                PAYMENT,
                vec![
                    Integer(3),
                    Integer(at(2026, 4, 1)),
                    Real(1_500.5),
                    Integer(2),
                ],
            ),
        ];

        for (statement, values) in rows {
            let mut query = sqlx::query(statement);

            for value in values {
                query = match value {
                    Null => query.bind(None::<String>),
                    Integer(value) => query.bind(value),
                    Real(value) => query.bind(value),
                    Text(value) => query.bind(value),
                };
            }

            query.execute(&mut *connection).await.expect(statement);
        }

        if version == Version::Thirteen {
            sqlx::query(
                "INSERT INTO history (id, at, concept, record_id, action, record) \
                 VALUES (1, ?, 'contract', 1, 'created', 'GOV-1')",
            )
            .bind(at(2025, 1, 1))
            .execute(&mut *connection)
            .await
            .expect("an entry of history");
        }
    }

    /// The migrations `version` shipped.
    fn shipped_by(version: Version) -> &'static [&'static str] {
        match version {
            Version::Twelve => SCHEMA_2,
            Version::Thirteen => SCHEMA_3,
        }
    }

    /// `app.db` in a directory of its own, as `version` left it, with a record of every kind.
    async fn left_by(version: Version) -> PathBuf {
        let path = scratch(version.name()).join("app.db");
        let mut connection = writable(&path).await;

        migrate(&mut connection, shipped_by(version)).await;
        records(&mut connection, version).await;
        connection.close().await.expect("the file closed");

        path
    }

    /// What the file is, byte for byte, and when it was last written.
    fn fingerprint(path: &Path) -> (Vec<u8>, std::time::SystemTime) {
        (
            std::fs::read(path).expect("the file"),
            std::fs::metadata(path)
                .and_then(|metadata| metadata.modified())
                .expect("its time"),
        )
    }

    fn expected_tables() -> serde_json::Value {
        serde_json::from_str(TABLES).expect("the tables the interface is handed")
    }

    #[tokio::test]
    async fn each_earlier_version_is_found_by_the_migrations_it_recorded() {
        for version in [Version::Twelve, Version::Thirteen] {
            let path = left_by(version).await;

            assert_eq!(find(&path).await.unwrap(), Some(Found { version }));
        }
    }

    // the criterion the ticket is: every record of either version reaches the tables, under the
    // tabs and the headings the transfer import recognises, and the workbook written holds the
    // same tables when it is read back as a chosen file would be.
    #[tokio::test]
    async fn every_record_of_each_version_is_read_into_the_export_and_written_as_its_workbook() {
        for version in [Version::Twelve, Version::Thirteen] {
            let path = left_by(version).await;
            let directory = path.parent().unwrap();

            let read = read(&path).await.expect("the records read");

            assert_eq!(read.version, version);
            assert_eq!(
                PathBuf::from(&read.path),
                directory
                    .join("backups")
                    .join("app")
                    .join(format!("workspace-{}.xlsx", version.name()))
            );
            assert_eq!(
                serde_json::to_value(&read.tables).unwrap(),
                expected_tables(),
                "{} read as the export",
                version.name()
            );

            let written = import::import_read_book(read.path.clone())
                .await
                .expect("the workbook written");

            assert_eq!(
                serde_json::to_value(&written).unwrap(),
                expected_tables(),
                "{}'s workbook",
                version.name()
            );
        }
    }

    // nothing here writes to the file an earlier version left: not the finding, and not the
    // reading, which writes its workbook somewhere else.
    #[tokio::test]
    async fn reading_an_earlier_version_leaves_its_file_as_it_was() {
        for version in [Version::Twelve, Version::Thirteen] {
            let path = left_by(version).await;
            let before = fingerprint(&path);

            // long enough for a write, were one made, to show in the file's time.
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;

            find(&path).await.expect("found");
            read(&path).await.expect("read");

            assert!(
                before == fingerprint(&path),
                "{} was written to",
                version.name()
            );
        }
    }

    // a unit whose complex, a contract whose tenant, a payment whose contract and a contract's
    // link whose unit is missing are left out of the sheets, and each is counted by kind in the
    // line the log keeps.
    #[tokio::test]
    async fn records_left_out_for_a_missing_parent_are_counted_by_kind() {
        let path = left_by(Version::Thirteen).await;
        let mut connection = writable(&path).await;

        // as a file an earlier version wrote without its foreign keys enforced might hold them.
        sqlx::query("PRAGMA foreign_keys = OFF")
            .execute(&mut connection)
            .await
            .expect("the pragma");
        for statement in [
            // unit 3, 101 of the second complex.
            "DELETE FROM complex WHERE id = 2",
            // contract 2 and its two payments.
            "DELETE FROM tenant WHERE id = 2",
            "INSERT INTO payment (id, date, amount, contract_id) VALUES (4, 0, 10.0, 99)",
            // a link to a unit that is not there, beside the one to unit 3, now left out.
            "INSERT INTO contract_unit (contract_id, unit_id) VALUES (1, 99)",
        ] {
            sqlx::query(statement)
                .execute(&mut connection)
                .await
                .expect(statement);
        }

        let (sheets, left_out) = sheets(&mut connection).await.expect("the sheets");
        connection.close().await.expect("the file closed");

        assert_eq!(
            left_out,
            LeftOut {
                units: 1,
                contracts: 1,
                payments: 3,
                unit_links: 2,
            }
        );
        let rows = |name: &str| {
            sheets
                .iter()
                .find(|sheet| sheet.name.as_deref() == Some(name))
                .map(|sheet| sheet.rows.len())
                .expect(name)
        };
        assert_eq!(
            (rows("Units"), rows("Contracts"), rows("Payments")),
            (2, 1, 1)
        );

        let line = read_record(Version::Thirteen, "workspace-0.13.0.xlsx", left_out);
        assert_eq!(line.event, "earlier.read");
        assert_eq!(line.level, diagnostics::DiagnosticLevel::Warn);
        assert_eq!(line.fields["unitsLeftOut"], "1");
        assert_eq!(line.fields["contractsLeftOut"], "1");
        assert_eq!(line.fields["paymentsLeftOut"], "3");
        assert_eq!(line.fields["unitLinksLeftOut"], "2");

        let whole = read_record(
            Version::Thirteen,
            "workspace-0.13.0.xlsx",
            LeftOut::default(),
        );
        assert_eq!(whole.level, diagnostics::DiagnosticLevel::Info);
        assert_eq!(whole.fields["paymentsLeftOut"], "0");
        assert_eq!(whole.fields["unitLinksLeftOut"], "0");

        let links_only = read_record(
            Version::Thirteen,
            "workspace-0.13.0.xlsx",
            LeftOut {
                unit_links: 1,
                ..LeftOut::default()
            },
        );
        assert_eq!(links_only.level, diagnostics::DiagnosticLevel::Warn);
    }

    #[tokio::test]
    async fn a_machine_with_no_file_is_not_given_one() {
        let path = scratch("absent").join("app.db");

        assert_eq!(find(&path).await.unwrap(), None);
        assert!(matches!(read(&path).await, Err(Error::NotFound { .. })));
        assert!(!path.exists(), "the file was created");
    }

    // what this build and 0.14.0 make of `app.db`: a file opened and never migrated.
    #[tokio::test]
    async fn a_file_no_earlier_version_migrated_holds_none_of_its_records() {
        let path = scratch("unmigrated").join("app.db");

        writable(&path).await.close().await.unwrap();

        assert_eq!(find(&path).await.unwrap(), None);
        assert!(matches!(read(&path).await, Err(Error::NotFound { .. })));
    }

    #[tokio::test]
    async fn an_earlier_version_that_holds_no_record_has_nothing_to_bring_over() {
        let path = scratch("empty").join("app.db");
        let mut connection = writable(&path).await;

        migrate(&mut connection, SCHEMA_3).await;
        connection.close().await.unwrap();

        assert_eq!(find(&path).await.unwrap(), None);
        assert!(matches!(read(&path).await, Err(Error::NotFound { .. })));
        assert!(
            !workbook_path(path.parent().unwrap(), Version::Thirteen).exists(),
            "a workbook was written of nothing"
        );
    }

    // a ledger that is not exactly what a release shipped was kept by something this does not
    // know the shape of, whether it recorded more or less.
    #[test]
    fn only_a_ledger_a_release_shipped_names_a_version() {
        let names = |names: &[&str]| {
            names
                .iter()
                .map(|name| (*name).to_owned())
                .collect::<Vec<_>>()
        };

        assert_eq!(Version::of(&names(SCHEMA_2)), Some(Version::Twelve));
        assert_eq!(Version::of(&names(SCHEMA_3)), Some(Version::Thirteen));
        assert_eq!(Version::of(&names(&SCHEMA_2[..1])), None);
        assert_eq!(
            Version::of(&names(&[SCHEMA_3, &["0003_serious_synch.sql"]].concat())),
            None
        );
        assert_eq!(Version::of(&[]), None);
    }

    // how the file names a contract, a unit and a day, spelled as the web side spells them.
    #[test]
    fn a_reference_is_spelled_as_the_transfer_spells_it() {
        assert_eq!(
            contract_reference(Some(" GOV-1 "), "1234567890", at(2026, 3, 1)),
            "GOV-1"
        );
        assert_eq!(
            contract_reference(Some("  "), "2234567891", at(2026, 3, 1)),
            "2234567891 @ 2026-03-01"
        );
        assert_eq!(
            contract_reference(None, "2234567891", at(2026, 3, 1)),
            "2234567891 @ 2026-03-01"
        );
        assert_eq!(unit_reference("Al Nakheel ", " A1"), "Al Nakheel / A1");
        // 2026-01-31 is serial 46053, the figure `transfer/import.rs` pins its reader to.
        assert!(matches!(day(at(2026, 1, 31)), Cell::Date { value } if value == 46_053.0));
    }

    // two numberless contracts of one tenant starting one day, spelled as `toContractReferences`
    // spells them: the end day, then an ordinal by id, and only where the bare spelling is shared.
    #[test]
    fn a_contract_reference_is_one_only_that_contract_answers_to() {
        let start = at(2026, 1, 1);
        let end = at(2026, 12, 31);
        let later = at(2027, 12, 31);
        let references = contract_references(&[
            (3, None, "1234567890", start, end),
            (1, Some(" "), "1234567890", start, end),
            (2, None, "1234567890", start, later),
            (4, None, "2234567890", start, end),
            (5, Some("GOV-1"), "1234567890", start, end),
        ]);

        assert_eq!(references[&1], "1234567890 @ 2026-01-01..2026-12-31 #1");
        assert_eq!(references[&3], "1234567890 @ 2026-01-01..2026-12-31 #2");
        assert_eq!(references[&2], "1234567890 @ 2026-01-01..2027-12-31");
        assert_eq!(references[&4], "2234567890 @ 2026-01-01");
        assert_eq!(references[&5], "GOV-1");
    }
}
