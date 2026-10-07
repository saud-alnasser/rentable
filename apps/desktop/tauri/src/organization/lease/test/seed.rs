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
    organization::{
        lease::apply::{apply, shipped_version, statements},
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
];

/// **The workspace as a build of the shipped version leaves it** (0.20.0, the first at 7): made
/// whole with its version row, as every workspace is from effort 838's ticket 32 on, and holding
/// [`SEEDED_AT_SEVEN`]. Opening it walks nothing. A migration added after it makes this the
/// version before, and its seed then joins [`SEEDS`], which fails until it does.
pub(crate) const AT_THE_SHIPPED_VERSION: Seed = Seed {
    version: 7,
    version_row: true,
    rows: SEEDED_AT_SEVEN,
    carried: carried_at_seven,
};

/// The database `seed` stands for, on a pipeline of its own: its first `version` migrations, its
/// version row where its build wrote one, and its rows.
pub(crate) async fn seeded(seed: &Seed) -> LocalPipeline {
    let pipeline = LocalPipeline::start().await;

    if seed.version_row {
        apply(&Pipeline::at(&pipeline.url("")), "t", seed.version)
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

    vec![
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
    ]
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

/// [`SEEDED_AT_SEVEN`] as it stands, which is how opening it must leave it: [`SEEDED_AT_SIX`]'s
/// rows carried, the refund after them, and the version row.
pub(crate) fn carried_at_seven() -> Contents {
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

    carried
}

/// A text value as a row holds it.
pub(crate) fn cell(value: &str) -> turso::Value {
    turso::Value::Text(value.to_string())
}
