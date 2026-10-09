//! every workspace version shipped from 0.14.0 on, as its build left a workspace, with rows: what
//! the walk to the shipped version starts from (effort 838, requirement 16, ticket 34;
//! `rules/migrations`), and what a member opening a workspace on this build starts from (effort
//! 857, requirement 13, ticket 14).
//!
//! **Scaffolding and not a fixture** (`rules/testing`, as the human admitted it on 2026-09-27): it
//! stands in for a database an older build wrote, which nothing in this build writes any more, and
//! two modules' tests read it, `apply.rs`'s walk and `mod.rs`'s opening. *It was at the foot of
//! `apply.rs` until effort 857's ticket 14 gave it a second reader.*

use crate::{
    database::{
        floor::Floors,
        step::{Steps, WORKSPACE_STEPS},
    },
    organization::{
        lease::apply::{self, Migrations, WORKSPACE_MIGRATIONS, shipped_version, statements},
        workspace::remote::Pipeline,
    },
    sync::test::pipeline::LocalPipeline,
};

/// The first workspace version a release on Turso shipped at: 0.14.0 and 0.15.0 are both at 5.
/// Earlier releases kept their records in one local file, and move over by the guided step of
/// effort 838's requirement 18 rather than by migration.
pub(crate) const FIRST_CARRIED: usize = 5;

/// Every table and every row a database holds, as `backup::contents_of` reads it: tables by
/// name, rows by rowid.
pub(crate) type Contents = Vec<(String, Vec<Vec<turso::Value>>)>;

/// A workspace database as a shipped version left it, and what walking it to the shipped
/// version must leave.
pub(crate) struct Seed {
    /// the version it is at: its first `version` migrations.
    pub(crate) version: usize,
    /// whether its build wrote the workspace's own version row, as a build from effort 838's
    /// ticket 32 on does, in the transaction that made it; no build before that wrote one.
    pub(crate) version_row: bool,
    /// the rows it holds, as that version's build wrote them.
    pub(crate) rows: &'static [&'static str],
    /// every row once it is at the shipped version, the version row included.
    pub(crate) carried: fn() -> Contents,
}

/// **One seed per shipped version from [`FIRST_CARRIED`] up to the one before the shipped
/// version.** A new migration comes with the seed of the version before it, the rows a
/// database of that version holds, and the rows each seed here holds once the new migration
/// has run.
pub(crate) const SEEDS: &[Seed] = &[
    Seed {
        version: 5,
        version_row: false,
        rows: SEEDED_AT_FIVE,
        carried: carried_from_five,
    },
    Seed {
        version: 6,
        version_row: false,
        rows: SEEDED_AT_SIX,
        carried: carried_from_six,
    },
    // 0.20.0, the first at 7, the shipped version until `0007` (effort 857, ticket 33).
    Seed {
        version: 7,
        version_row: true,
        rows: SEEDED_AT_SEVEN,
        carried: carried_from_seven,
    },
    // the first build declaring a step after 857, at 8 until `0008` (effort 857, ticket 35).
    Seed {
        version: 8,
        version_row: true,
        rows: SEEDED_AT_EIGHT,
        carried: carried_from_eight,
    },
    // the shipped version from `0008` until `0009` (effort 861, ticket 09).
    Seed {
        version: 9,
        version_row: true,
        rows: SEEDED_AT_NINE,
        carried: carried_from_nine,
    },
];

/// **The workspace as a build of the shipped version leaves it**, at 10 since `0009` (effort 861,
/// ticket 09): created whole by that build, with its version row and effort 857's records, as
/// every workspace is from effort 857's ticket 21 on, and holding [`SEEDED_AT_TEN`]. Opening it
/// walks nothing. A migration added after it makes this the version before, and its seed then
/// joins [`SEEDS`], which fails until it does.
pub(crate) const AT_THE_SHIPPED_VERSION: Seed = Seed {
    version: 10,
    version_row: true,
    rows: SEEDED_AT_TEN,
    carried: carried_at_ten,
};

/// The workspace ladder of the build at `version`: its first `version` migrations and their
/// declarations, which is what that build created a workspace with.
pub(crate) fn ladder_at(version: usize) -> Migrations {
    Migrations {
        files: &WORKSPACE_MIGRATIONS[..version],
        steps: Steps {
            first: 1,
            declared: &WORKSPACE_STEPS[..version],
        },
    }
}

/// The database `seed` stands for, on a pipeline of its own: its first `version` migrations, its
/// version row where its build wrote one, and its rows. A build that wrote the row created the
/// workspace whole, as [`apply::create`] does with that build's ladder, and so with effort 857's
/// records where a step declared after 857 is on it.
pub(crate) async fn seeded(seed: &Seed) -> LocalPipeline {
    let pipeline = LocalPipeline::start().await;

    if seed.version_row {
        apply::create(
            &Pipeline::at(&pipeline.url("")),
            "t",
            &ladder_at(seed.version),
            1_757_000_000_000,
        )
        .await
        .unwrap_or_else(|error| panic!("the seed at {}: {error:?}", seed.version));
    } else {
        pipeline.holding(&statements(seed.version)).await;
    }

    pipeline
        .holding(
            &seed
                .rows
                .iter()
                .map(|row| row.to_string())
                .collect::<Vec<String>>(),
        )
        .await;

    pipeline
}

/// A workspace as 0.14.0 and 0.15.0 wrote it: a record of every kind, a contract with a
/// government id and one without, a unit on both contracts and one on neither, a payment on
/// each contract and one of them fractional, and history naming a record by its id. `0005`
/// adds a payment's method, reference and note, so every payment here is one written before it.
pub(crate) const SEEDED_AT_FIVE: &[&str] = &[
    "INSERT INTO `complex` (`id`, `name`, `location`) VALUES \
     ('0199a000-0000-7000-8000-0000000c0001', 'North Towers', 'Riyadh, Olaya'), \
     ('0199a000-0000-7000-8000-0000000c0002', 'برج الروضة', 'Jeddah')",
    "INSERT INTO `tenant` (`id`, `national_id`, `name`, `phone`) VALUES \
     ('0199a000-0000-7000-8000-000000070001', '1012345678', 'Sara Al-Harbi', '0501234567'), \
     ('0199a000-0000-7000-8000-000000070002', '2098765432', 'خالد العتيبي', '0559876543')",
    "INSERT INTO `unit` (`id`, `name`, `status`, `complex_id`) VALUES \
     ('0199a000-0000-7000-8000-0000000a0001', 'A-101', 'occupied', \
      '0199a000-0000-7000-8000-0000000c0001'), \
     ('0199a000-0000-7000-8000-0000000a0002', 'A-102', 'occupied', \
      '0199a000-0000-7000-8000-0000000c0001'), \
     ('0199a000-0000-7000-8000-0000000a0003', 'B-1', 'vacant', \
      '0199a000-0000-7000-8000-0000000c0002')",
    "INSERT INTO `contract` (`id`, `gov_id`, `status`, `start_date`, `end_date`, \
     `interval_in_months`, `cost_per_interval`, `paid_amount`, `expected_amount`, \
     `tenant_id`) VALUES \
     ('0199a000-0000-7000-8000-0000000d0001', '20250001', 'active', 1735689600000, \
      1767225600000, '6m', 30000.5, 15000.25, 30000.5, \
      '0199a000-0000-7000-8000-000000070001'), \
     ('0199a000-0000-7000-8000-0000000d0002', NULL, 'expired', 1704067200000, \
      1735603200000, '1m', 2500, 0, 0, '0199a000-0000-7000-8000-000000070002')",
    "INSERT INTO `contract_unit` (`contract_id`, `unit_id`) VALUES \
     ('0199a000-0000-7000-8000-0000000d0001', '0199a000-0000-7000-8000-0000000a0001'), \
     ('0199a000-0000-7000-8000-0000000d0001', '0199a000-0000-7000-8000-0000000a0002'), \
     ('0199a000-0000-7000-8000-0000000d0002', '0199a000-0000-7000-8000-0000000a0002')",
    "INSERT INTO `payment` (`id`, `date`, `amount`, `contract_id`) VALUES \
     ('0199a000-0000-7000-8000-0000000e0001', 1738368000000, 15000.25, \
      '0199a000-0000-7000-8000-0000000d0001'), \
     ('0199a000-0000-7000-8000-0000000e0002', 1706745600000, 2500, \
      '0199a000-0000-7000-8000-0000000d0002')",
    "INSERT INTO `history` (`id`, `at`, `concept`, `record_id`, `action`, `record`) VALUES \
     ('0199a000-0000-7000-8000-0000000f0001', 1738368000000, 'payment', \
      '0199a000-0000-7000-8000-0000000e0001', 'created', '15000.25'), \
     ('0199a000-0000-7000-8000-0000000f0002', 1738454400000, 'tenant', \
      '0199a000-0000-7000-8000-000000070002', 'edited', 'خالد العتيبي')",
];

/// [`SEEDED_AT_FIVE`] at the shipped version: every row where it was, each payment's method,
/// reference and note null, each payment received, and the version row.
pub(crate) fn carried_from_five() -> Contents {
    let null = || turso::Value::Null;

    with_nothing_merged(vec![
        (
            "complex".to_string(),
            vec![
                vec![
                    cell("0199a000-0000-7000-8000-0000000c0001"),
                    cell("North Towers"),
                    cell("Riyadh, Olaya"),
                ],
                vec![
                    cell("0199a000-0000-7000-8000-0000000c0002"),
                    cell("برج الروضة"),
                    cell("Jeddah"),
                ],
            ],
        ),
        (
            "contract".to_string(),
            vec![
                vec![
                    cell("0199a000-0000-7000-8000-0000000d0001"),
                    cell("20250001"),
                    cell("active"),
                    turso::Value::Integer(1_735_689_600_000),
                    turso::Value::Integer(1_767_225_600_000),
                    cell("6m"),
                    turso::Value::Real(30_000.5),
                    turso::Value::Real(15_000.25),
                    turso::Value::Real(30_000.5),
                    cell("0199a000-0000-7000-8000-000000070001"),
                ],
                vec![
                    cell("0199a000-0000-7000-8000-0000000d0002"),
                    null(),
                    cell("expired"),
                    turso::Value::Integer(1_704_067_200_000),
                    turso::Value::Integer(1_735_603_200_000),
                    cell("1m"),
                    turso::Value::Real(2_500.0),
                    turso::Value::Real(0.0),
                    turso::Value::Real(0.0),
                    cell("0199a000-0000-7000-8000-000000070002"),
                ],
            ],
        ),
        (
            "contract_unit".to_string(),
            vec![
                vec![
                    cell("0199a000-0000-7000-8000-0000000d0001"),
                    cell("0199a000-0000-7000-8000-0000000a0001"),
                ],
                vec![
                    cell("0199a000-0000-7000-8000-0000000d0001"),
                    cell("0199a000-0000-7000-8000-0000000a0002"),
                ],
                vec![
                    cell("0199a000-0000-7000-8000-0000000d0002"),
                    cell("0199a000-0000-7000-8000-0000000a0002"),
                ],
            ],
        ),
        (
            "history".to_string(),
            vec![
                vec![
                    cell("0199a000-0000-7000-8000-0000000f0001"),
                    turso::Value::Integer(1_738_368_000_000),
                    cell("payment"),
                    cell("0199a000-0000-7000-8000-0000000e0001"),
                    cell("created"),
                    cell("15000.25"),
                ],
                vec![
                    cell("0199a000-0000-7000-8000-0000000f0002"),
                    turso::Value::Integer(1_738_454_400_000),
                    cell("tenant"),
                    cell("0199a000-0000-7000-8000-000000070002"),
                    cell("edited"),
                    cell("خالد العتيبي"),
                ],
            ],
        ),
        (
            "payment".to_string(),
            vec![
                vec![
                    cell("0199a000-0000-7000-8000-0000000e0001"),
                    turso::Value::Integer(1_738_368_000_000),
                    turso::Value::Real(15_000.25),
                    cell("0199a000-0000-7000-8000-0000000d0001"),
                    null(),
                    null(),
                    null(),
                    cell("received"),
                ],
                vec![
                    cell("0199a000-0000-7000-8000-0000000e0002"),
                    turso::Value::Integer(1_706_745_600_000),
                    turso::Value::Real(2_500.0),
                    cell("0199a000-0000-7000-8000-0000000d0002"),
                    null(),
                    null(),
                    null(),
                    cell("received"),
                ],
            ],
        ),
        (
            "schema_version".to_string(),
            vec![vec![
                turso::Value::Integer(1),
                turso::Value::Integer(shipped_version()),
            ]],
        ),
        (
            "tenant".to_string(),
            vec![
                vec![
                    cell("0199a000-0000-7000-8000-000000070001"),
                    cell("1012345678"),
                    cell("Sara Al-Harbi"),
                    cell("0501234567"),
                ],
                vec![
                    cell("0199a000-0000-7000-8000-000000070002"),
                    cell("2098765432"),
                    cell("خالد العتيبي"),
                    cell("0559876543"),
                ],
            ],
        ),
        (
            "unit".to_string(),
            vec![
                vec![
                    cell("0199a000-0000-7000-8000-0000000a0001"),
                    cell("A-101"),
                    cell("occupied"),
                    cell("0199a000-0000-7000-8000-0000000c0001"),
                ],
                vec![
                    cell("0199a000-0000-7000-8000-0000000a0002"),
                    cell("A-102"),
                    cell("occupied"),
                    cell("0199a000-0000-7000-8000-0000000c0001"),
                ],
                vec![
                    cell("0199a000-0000-7000-8000-0000000a0003"),
                    cell("B-1"),
                    cell("vacant"),
                    cell("0199a000-0000-7000-8000-0000000c0002"),
                ],
            ],
        ),
    ])
}

/// A workspace as a build at version 6 wrote it: every record of [`SEEDED_AT_FIVE`] but its
/// payments, which now say how they were paid, one with a reference and a note and one with
/// a note alone. `0006` adds a payment's direction, so every payment here is one written
/// before it, and money received.
pub(crate) const SEEDED_AT_SIX: &[&str] = &[
    SEEDED_AT_FIVE[0],
    SEEDED_AT_FIVE[1],
    SEEDED_AT_FIVE[2],
    SEEDED_AT_FIVE[3],
    SEEDED_AT_FIVE[4],
    "INSERT INTO `payment` (`id`, `date`, `amount`, `contract_id`, `method`, `reference`,          `note`) VALUES          ('0199a000-0000-7000-8000-0000000e0001', 1738368000000, 15000.25,           '0199a000-0000-7000-8000-0000000d0001', 'bank-transfer', 'SADAD-7731', 'first half'),          ('0199a000-0000-7000-8000-0000000e0002', 1706745600000, 2500,           '0199a000-0000-7000-8000-0000000d0002', 'cash', NULL, 'دفعة نقدية')",
    SEEDED_AT_FIVE[6],
];

/// [`SEEDED_AT_SIX`] at the shipped version: every row where it was, each payment's method,
/// reference and note as written, each payment received, and the version row.
pub(crate) fn carried_from_six() -> Contents {
    let mut carried = carried_from_five();
    let (_, payments) = carried
        .iter_mut()
        .find(|(table, _)| table == "payment")
        .expect("the payments carried from five");

    payments[0][4] = cell("bank-transfer");
    payments[0][5] = cell("SADAD-7731");
    payments[0][6] = cell("first half");
    payments[1][4] = cell("cash");
    payments[1][6] = cell("دفعة نقدية");

    carried
}

/// A workspace as 0.20.0 wrote it: every record of [`SEEDED_AT_SIX`], each payment written with
/// no direction and so money received, and a refund on the first contract, which `0006` added.
pub(crate) const SEEDED_AT_SEVEN: &[&str] = &[
    SEEDED_AT_SIX[0],
    SEEDED_AT_SIX[1],
    SEEDED_AT_SIX[2],
    SEEDED_AT_SIX[3],
    SEEDED_AT_SIX[4],
    SEEDED_AT_SIX[5],
    SEEDED_AT_SIX[6],
    "INSERT INTO `payment` (`id`, `date`, `amount`, `contract_id`, `method`, `reference`, \
     `note`, `direction`) VALUES \
     ('0199a000-0000-7000-8000-0000000e0003', 1740787200000, 500.5, \
      '0199a000-0000-7000-8000-0000000d0001', 'cash', NULL, 'مبلغ مسترد', 'refund')",
];

/// [`SEEDED_AT_SEVEN`] at the shipped version: [`SEEDED_AT_SIX`]'s rows carried, the refund after
/// them, and the version row.
pub(crate) fn carried_from_seven() -> Contents {
    let mut carried = carried_from_six();
    let (_, payments) = carried
        .iter_mut()
        .find(|(table, _)| table == "payment")
        .expect("the payments carried from six");

    payments.push(vec![
        cell("0199a000-0000-7000-8000-0000000e0003"),
        turso::Value::Integer(1_740_787_200_000),
        turso::Value::Real(500.5),
        cell("0199a000-0000-7000-8000-0000000d0001"),
        cell("cash"),
        turso::Value::Null,
        cell("مبلغ مسترد"),
        cell("refund"),
    ]);

    with_nothing_merged(carried)
}

/// A workspace as a build at 8 wrote it: every record of [`SEEDED_AT_SEVEN`], and a second tenant
/// with the first's phone, which `0007` let two machines save apart (effort 857, ticket 33).
pub(crate) const SEEDED_AT_EIGHT: &[&str] = &[
    SEEDED_AT_SEVEN[0],
    SEEDED_AT_SEVEN[1],
    SEEDED_AT_SEVEN[2],
    SEEDED_AT_SEVEN[3],
    SEEDED_AT_SEVEN[4],
    SEEDED_AT_SEVEN[5],
    SEEDED_AT_SEVEN[6],
    SEEDED_AT_SEVEN[7],
    "INSERT INTO `tenant` (`id`, `national_id`, `name`, `phone`) VALUES      ('0199a000-0000-7000-8000-000000070003', '1012345679', 'Sara Al-Harbi', '0501234567')",
];

/// [`SEEDED_AT_EIGHT`] at the shipped version: [`SEEDED_AT_SEVEN`]'s rows carried, the second
/// tenant after them, nobody retired, and the version row. The records its build wrote creating it
/// are as opening it leaves them, which the opening's test adds.
pub(crate) fn carried_from_eight() -> Contents {
    let mut carried = carried_from_seven();
    let (_, tenants) = carried
        .iter_mut()
        .find(|(table, _)| table == "tenant")
        .expect("the tenants carried from seven");

    tenants.push(vec![
        cell("0199a000-0000-7000-8000-000000070003"),
        cell("1012345679"),
        cell("Sara Al-Harbi"),
        cell("0501234567"),
        turso::Value::Null,
        turso::Value::Null,
    ]);

    with_nothing_merged(carried)
}

/// A workspace as a build at 9 wrote it: every record of [`SEEDED_AT_EIGHT`], and a copy of the
/// first tenant a machine saved apart, which the pass after a pull retired into it (effort 857,
/// ticket 35).
pub(crate) const SEEDED_AT_NINE: &[&str] = &[
    SEEDED_AT_EIGHT[0],
    SEEDED_AT_EIGHT[1],
    SEEDED_AT_EIGHT[2],
    SEEDED_AT_EIGHT[3],
    SEEDED_AT_EIGHT[4],
    SEEDED_AT_EIGHT[5],
    SEEDED_AT_EIGHT[6],
    SEEDED_AT_EIGHT[7],
    SEEDED_AT_EIGHT[8],
    "INSERT INTO `tenant` (`id`, `national_id`, `name`, `phone`, `merged_into`, `merged_as`) \
     VALUES ('0199a000-0000-7000-8000-000000070004', '1012345678', 'Sara Al-Harbi', \
     '0501234567', '0199a000-0000-7000-8000-000000070001', \
     '{\"name\":\"Sara Al-Harbi\",\"national_id\":\"1012345678\",\"phone\":\"0501234567\"}')",
];

/// [`SEEDED_AT_NINE`] at the shipped version: [`SEEDED_AT_EIGHT`]'s rows carried, the retired copy
/// after them, no contract renewing another, and the version row. The records its build wrote
/// creating it are as opening it leaves them, which the opening's test adds.
pub(crate) fn carried_from_nine() -> Contents {
    let mut carried = carried_from_eight();
    let (_, tenants) = carried
        .iter_mut()
        .find(|(table, _)| table == "tenant")
        .expect("the tenants carried from eight");

    tenants.push(vec![
        cell("0199a000-0000-7000-8000-000000070004"),
        cell("1012345678"),
        cell("Sara Al-Harbi"),
        cell("0501234567"),
        cell("0199a000-0000-7000-8000-000000070001"),
        cell(
            "{\"name\":\"Sara Al-Harbi\",\"national_id\":\"1012345678\",\"phone\":\"0501234567\"}",
        ),
    ]);

    with_nothing_merged(carried)
}

/// A workspace as a build at 10 wrote it: every record of [`SEEDED_AT_NINE`], and a renewal of the
/// first contract, starting the day after it ends on the same tenant and the same two units, which
/// names it as the contract it renews (effort 861, ticket 09).
pub(crate) const SEEDED_AT_TEN: &[&str] = &[
    SEEDED_AT_NINE[0],
    SEEDED_AT_NINE[1],
    SEEDED_AT_NINE[2],
    SEEDED_AT_NINE[3],
    SEEDED_AT_NINE[4],
    SEEDED_AT_NINE[5],
    SEEDED_AT_NINE[6],
    SEEDED_AT_NINE[7],
    SEEDED_AT_NINE[8],
    SEEDED_AT_NINE[9],
    "INSERT INTO `contract` (`id`, `gov_id`, `status`, `start_date`, `end_date`,      `interval_in_months`, `cost_per_interval`, `paid_amount`, `expected_amount`,      `tenant_id`, `renews_contract_id`) VALUES      ('0199a000-0000-7000-8000-0000000d0003', '20260001', 'active', 1767312000000,       1798761600000, '6m', 30000.5, 0, 30000.5, '0199a000-0000-7000-8000-000000070001',       '0199a000-0000-7000-8000-0000000d0001')",
    "INSERT INTO `contract_unit` (`contract_id`, `unit_id`) VALUES      ('0199a000-0000-7000-8000-0000000d0003', '0199a000-0000-7000-8000-0000000a0001'),      ('0199a000-0000-7000-8000-0000000d0003', '0199a000-0000-7000-8000-0000000a0002')",
];

/// [`SEEDED_AT_TEN`] as it stands, which is how opening it must leave it: [`SEEDED_AT_NINE`]'s rows
/// carried, the renewal and its two units after them, the version row, and the records its build
/// wrote creating it.
pub(crate) fn carried_at_ten() -> Contents {
    let mut carried = carried_from_nine();
    let (_, contracts) = carried
        .iter_mut()
        .find(|(table, _)| table == "contract")
        .expect("the contracts carried from nine");

    contracts.push(vec![
        cell("0199a000-0000-7000-8000-0000000d0003"),
        cell("20260001"),
        cell("active"),
        turso::Value::Integer(1_767_312_000_000),
        turso::Value::Integer(1_798_761_600_000),
        cell("6m"),
        turso::Value::Real(30_000.5),
        turso::Value::Real(0.0),
        turso::Value::Real(30_000.5),
        cell("0199a000-0000-7000-8000-000000070001"),
        turso::Value::Null,
        turso::Value::Null,
        cell("0199a000-0000-7000-8000-0000000d0001"),
    ]);

    let (_, assignments) = carried
        .iter_mut()
        .find(|(table, _)| table == "contract_unit")
        .expect("the units contracts held, carried from nine");

    for unit in [
        "0199a000-0000-7000-8000-0000000a0001",
        "0199a000-0000-7000-8000-0000000a0002",
    ] {
        assignments.push(vec![
            cell("0199a000-0000-7000-8000-0000000d0003"),
            cell(unit),
        ]);
    }

    recorded(carried, ladder_at(10).steps.born())
}

/// `contents` at the shipped version, where `0008` gave a tenant, a complex, a contract, a unit
/// and a payment `merged_into` and `merged_as`, empty on every record a build before it wrote
/// (effort 857, ticket 35), and `0009` gave a contract `renews_contract_id`, empty on every
/// contract a build before it wrote (effort 861, ticket 09): each row of those tables made as wide
/// as the shipped table, with nothing in what it did not hold. A row already that wide is left as
/// it is.
fn with_nothing_merged(mut contents: Contents) -> Contents {
    for (table, rows) in contents.iter_mut() {
        let width = match table.as_str() {
            "complex" => 5,
            "tenant" | "unit" => 6,
            "payment" => 10,
            "contract" => 13,
            _ => continue,
        };

        for row in rows.iter_mut() {
            row.resize(width.max(row.len()), turso::Value::Null);
        }
    }

    contents
}

/// `contents` with effort 857's records as a step declared after 857 leaves them in a workspace
/// whose version runs unbroken: `applied_step` listing nothing above it, and `data_floor` holding
/// `floors`. Tables stay in the order `backup::contents_of` reads them, by name.
pub(crate) fn recorded(mut contents: Contents, floors: Floors) -> Contents {
    contents.retain(|(table, _)| table != "applied_step" && table != "data_floor");
    contents.push(("applied_step".to_string(), Vec::new()));
    contents.push((
        "data_floor".to_string(),
        vec![vec![
            turso::Value::Integer(1),
            turso::Value::Integer(i64::from(floors.level)),
            turso::Value::Integer(i64::from(floors.read)),
            turso::Value::Integer(i64::from(floors.write)),
        ]],
    ));
    contents.sort_by(|(one, _), (other, _)| one.cmp(other));

    contents
}

/// A text value as a row holds it.
pub(crate) fn cell(value: &str) -> turso::Value {
    turso::Value::Text(value.to_string())
}
