//! every step a database takes, declared as one of two kinds with the floors it moves (effort 857,
//! requirement 2).
//!
//! **Two ladders, one table each.** A workspace climbs its migrations, embedded by `build.rs` as
//! `WORKSPACE_MIGRATIONS` (`organization/lease/apply.rs`), and an organization climbs its changes of
//! format, listed in order as `upgrade::format::TRANSITIONS`. [`WORKSPACE_STEPS`] has one entry for
//! each migration, by its index, and [`FORMAT_STEPS`] one for each change of format; the tests at
//! the foot of this file fail where either list and its table differ in length.
//!
//! **A step's number is the version it brings the data to**, which is the numbering the floors are
//! in. The workspace's first migration, `0000`, is step 1, since a workspace that has taken it is at
//! `schema_version` 1; the organization's first change, from format 1, is step 2, since it makes
//! format 2. A floor of `n` means a build must know step `n` to read the data, or to write it, and
//! [`Ladder::known`] is the highest step this build knows: the workspace's shipped count, and the
//! organization's `FORMAT_VERSION`.
//!
//! **The kind decides who runs a step and what it moves.** An [`Kind::Addition`] creates a table or
//! an index, or adds a column that may be empty or has a default, and changes the meaning of nothing
//! an older build reads or writes: it moves neither floor, and any machine whose build ships it may
//! run it. Anything else is an [`Kind::Upgrade`], run only by the explicit act of somebody holding
//! the permission for it, and it raises the floors it declares. A meaning change that only adds a
//! column is split into an addition and an upgrade, so what arrives on its own is always safe for
//! every build that can still read the data. [`addition_sql_is_additive`] checks the shape of an
//! addition's SQL; whether it changes meaning is a question for review, which is why the ticket
//! adding a step names its kind ([[rules/migrations]]).
//!
//! **Shipped steps are declared here, beside them, and never in their SQL**, since a shipped step is
//! never edited. Every step shipped before this effort is an upgrade whose floors are its own
//! number: every build released before it refused a workspace or an organization whose number had
//! risen past its own, so that is the floor each step effectively had. Two of them would be
//! upgrades on their meaning alone. `0006` adds `payment.direction` with a default, additive in
//! shape, but a build that does not know it counts a refund as money received. Format 3 adds
//! `workspace_override` and touches nothing else, but a build that does not know it grants a member
//! more than their override allows. Both raise the read floor as well as the write floor, which is
//! what their number already says.
//!
//! **And every one of them is marked [`Step::shipped_before_857`], and still runs on open**
//! (requirement 1, amended at /implement): format 1 to 2 on the owner's machine, the rest by the
//! first full-access member under the lease, exactly as 0.20 runs them. Data in users' hands today
//! stands behind them, and holding `0006` for a manager would lock members out of their payments.
//! The rule that an upgrade waits for the explicit act binds every step declared after them, and
//! [`Step::runs_on_open`] is the one place that says which run. `0007`, which takes the shared
//! database's rule on four fields a person types away, is the first step declared after them, an
//! addition (ticket 33).
//!
//! *Here, under the database, since effort 857's ticket 03*: the organization's lease and store
//! read these declarations, and nothing but the composition root may name `upgrade`
//! (`guard/cycle.rs`). It was `upgrade/step.rs` until then, beside `floor.rs`, which ticket 04
//! moved here for the same reason.

use super::floor::Floors;

/// One step of a database, as it is declared.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Step {
    /// an addition, or an upgrade with the floors it raises.
    pub kind: Kind,
    /// the key of the sentence that says what the step adds or changes, under
    /// `organization.upgrade.steps` in both locales: what the upgrade sheet shows.
    pub describes: &'static str,
    /// whether it shipped before effort 857, and so still runs on open whatever its kind, as 0.20
    /// ran it. Never set on a step declared after.
    pub shipped_before_857: bool,
}

impl Step {
    /// Whether opening the data runs this step, by whoever may write it: every step shipped before
    /// effort 857, and every addition. Any other step waits for the explicit upgrade.
    pub fn runs_on_open(&self) -> bool {
        self.shipped_before_857 || self.kind == Kind::Addition
    }
}

/// One ladder's declarations as a runner is handed them: the number of its first step and every
/// step in order. [`Ladder::steps`] in production, and a ladder of a test's own under test.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Steps {
    /// the number of the first step: 1 on the workspace's ladder, 2 on the organization's.
    pub first: u32,
    /// every step, in order.
    pub declared: &'static [Step],
}

impl Steps {
    /// The highest step this ladder knows.
    pub fn known(&self) -> u32 {
        self.first + self.declared.len() as u32 - 1
    }

    /// The step numbered `number`, where the ladder declares one.
    pub fn step(&self, number: u32) -> Option<&'static Step> {
        number
            .checked_sub(self.first)
            .and_then(|index| self.declared.get(index as usize))
    }

    /// The last step of the unbroken run shipped before effort 857, from the first: as far as the
    /// numbers builds before 857 read (the organization's `workspace.schema_version`, the `format`
    /// row) are moved on open.
    pub fn settled(&self) -> u32 {
        let shipped = self
            .declared
            .iter()
            .take_while(|step| step.shipped_before_857)
            .count() as u32;

        self.first + shipped - 1
    }

    /// The steps opening data that has run every step up to `level`, and `applied` above it, runs:
    /// each one above `level` this ladder knows, not yet applied, that [`Step::runs_on_open`]. A
    /// step waiting for the explicit upgrade is passed over, and the additions after it still run.
    pub fn on_open(&self, level: u32, applied: &[u32]) -> Vec<u32> {
        (level.saturating_add(1)..=self.known())
            .filter(|number| !applied.contains(number))
            .filter(|number| self.step(*number).is_some_and(Step::runs_on_open))
            .collect()
    }

    /// The upgrades waiting for the explicit act on data whose floors are `floors` (effort 857,
    /// ticket 07): each step declared after 857 that opening passes over and that raises a floor
    /// past the one recorded. An upgrade that has run took the floors to what it declares, so the
    /// floors are what say it has; the organization keeps no list of the steps it took.
    pub fn awaiting(&self, floors: Floors) -> Vec<u32> {
        (self.settled().saturating_add(1)..=self.known())
            .filter(|number| {
                self.step(*number).is_some_and(|step| match step.kind {
                    Kind::Upgrade {
                        read_floor,
                        write_floor,
                        ..
                    } if !step.runs_on_open() => {
                        read_floor.is_some_and(|read| read > floors.read)
                            || write_floor.is_some_and(|write| write > floors.write)
                    }
                    _ => false,
                })
            })
            .collect()
    }

    /// Whether any of the steps `numbers` needs the owner's own key.
    pub fn need_the_owner(&self, numbers: &[u32]) -> bool {
        numbers.iter().any(|number| {
            matches!(
                self.step(*number).map(|step| step.kind),
                Some(Kind::Upgrade {
                    needs_owner: true,
                    ..
                })
            )
        })
    }

    /// What `before` becomes once the steps `ran` have run, taking the data to `level`: an addition
    /// leaves both floors where they were, and an upgrade raises each to what it declares, where
    /// that is higher.
    pub fn raised(&self, before: Floors, ran: &[u32], level: u32) -> Floors {
        ran.iter().filter_map(|number| self.step(*number)).fold(
            Floors {
                level: level.max(before.level),
                ..before
            },
            |floors, step| match step.kind {
                Kind::Upgrade {
                    read_floor,
                    write_floor,
                    ..
                } => Floors {
                    read: floors.read.max(read_floor.unwrap_or(0)),
                    write: floors.write.max(write_floor.unwrap_or(0)),
                    ..floors
                },
                Kind::Addition => floors,
            },
        )
    }

    /// The number builds before 857 read (the organization's `workspace.schema_version`, the
    /// `format` row), `legacy` now, as an upgrade taking the floors to `after` leaves it (ticket
    /// 07). It moves only where a floor passes what any of those builds knows, the last step shipped
    /// before 857, and they can still read it; and then to the higher floor, which every one of them
    /// refuses, since none knows a step past [`Steps::settled`]. A build from 857 on reads the floor
    /// record rather than this number.
    pub fn legacy_after(&self, legacy: u32, after: Floors) -> u32 {
        let settled = self.settled();
        let highest = after.read.max(after.write);

        if legacy <= settled && highest > settled {
            highest
        } else {
            legacy
        }
    }

    /// The floors data created from nothing is born with (effort 857, ticket 21): every step of
    /// this ladder run, the level the last of them, and each floor the highest any of them
    /// declares, never the level. An addition raises neither, so the first addition after 857
    /// stops no build that reads and writes what the steps before it made.
    pub fn born(&self) -> Floors {
        let every: Vec<u32> = (self.first..=self.known()).collect();

        self.raised(
            Floors::legacy(self.first.saturating_sub(1)),
            &every,
            self.known(),
        )
    }

    /// The number builds before 857 read (the organization's `workspace.schema_version`, the
    /// `format` row) on data created from nothing: the last step they know, which they accept,
    /// unless a declared floor passes it and they must be stopped ([`Steps::legacy_after`], the
    /// rule the explicit upgrade follows).
    pub fn born_legacy(&self) -> u32 {
        self.legacy_after(self.settled(), self.born())
    }
}

/// What a step may do, and so who runs it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// a new table or index, or a column that may be empty or has a default, with no change of
    /// meaning: run by any machine whose build ships it, moving neither floor.
    Addition,
    /// anything else, run only by the explicit upgrade.
    Upgrade {
        /// the step a build must know to read the data once this has run, where it raises that.
        read_floor: Option<u32>,
        /// the step a build must know to write the data once this has run, where it raises that.
        write_floor: Option<u32>,
        /// whether it needs the owner's own key, as every step that re-signs the organization's
        /// rows does: it then runs on the owner's machine whoever holds the permission.
        needs_owner: bool,
    },
}

/// The ladder a step is on: the workspace's migrations, or the organization's changes of format.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ladder {
    Workspace,
    Format,
}

impl Ladder {
    /// Every step on this ladder this build declares, in order.
    pub fn steps(self) -> &'static [Step] {
        match self {
            Ladder::Workspace => WORKSPACE_STEPS,
            Ladder::Format => FORMAT_STEPS,
        }
    }

    /// This ladder's declarations, as a runner is handed them.
    pub fn declared(self) -> Steps {
        Steps {
            first: self.first(),
            declared: self.steps(),
        }
    }

    /// The number of the first step: 1 on the workspace's ladder, whose data starts at version 0,
    /// and 2 on the organization's, whose first format is 1 and needed no step to reach.
    pub fn first(self) -> u32 {
        match self {
            Ladder::Workspace => 1,
            Ladder::Format => 2,
        }
    }

    /// The highest step this build knows on this ladder: what it is judged with against a
    /// database's floors.
    pub fn known(self) -> u32 {
        self.first() + self.steps().len() as u32 - 1
    }

    /// The step numbered `number`, where this build declares one.
    pub fn step(self, number: u32) -> Option<&'static Step> {
        number
            .checked_sub(self.first())
            .and_then(|index| self.steps().get(index as usize))
    }
}

/// A step shipped before effort 857: an upgrade raising both floors to its own number, which is
/// what every build released before it enforced by refusing any rise, and run on open as 0.20 ran
/// it.
const fn shipped(number: u32, needs_owner: bool, describes: &'static str) -> Step {
    Step {
        kind: Kind::Upgrade {
            read_floor: Some(number),
            write_floor: Some(number),
            needs_owner,
        },
        describes,
        shipped_before_857: true,
    }
}

/// Every workspace migration, by its index: `WORKSPACE_STEPS[i]` is the file numbered `000i` and
/// step `i + 1`.
pub const WORKSPACE_STEPS: &[Step] = &[
    // 0000: the first tables.
    shipped(1, false, "workspaceRecords"),
    // 0001: the paid and expected amounts on a contract.
    shipped(2, false, "contractAmounts"),
    // 0002: the history of every record.
    shipped(3, false, "recordHistory"),
    // 0003: every record's id rebuilt as text, seven tables dropped and renamed.
    shipped(4, false, "recordIds"),
    // 0004: an index on a payment's contract.
    shipped(5, false, "paymentIndex"),
    // 0005: how a payment was paid, its reference and its note.
    shipped(6, false, "paymentMethod"),
    // 0006: which way a payment's money went; a refund is miscounted as received by a build that
    // does not know it, so it raises the read floor too (the module comment says so).
    shipped(7, false, "paymentDirection"),
    // 0007: the shared database's rule on a tenant's phone and national ID, a complex's name and a
    // contract's government ID taken away (effort 857, requirement 14). The rule refused the
    // second of two machines that saved one value apart, and the engine then dropped that
    // machine's records; the app keeps those values unique when a person saves. Taking a rule away
    // refuses an older build nothing and changes nothing it reads or writes, so it is an addition.
    Step {
        kind: Kind::Addition,
        describes: "duplicateValues",
        shipped_before_857: false,
    },
];

/// Every change of an organization's format, in the order of `TRANSITIONS`: `FORMAT_STEPS[i]` is
/// the change from format `i + 1`, and step `i + 2`.
pub const FORMAT_STEPS: &[Step] = &[
    // format 1 to 2: every row re-signed into a chain of certificates, with the owner's key.
    shipped(2, true, "chainOfCertificates"),
    // format 2 to 3: a member's override for one workspace; a build that does not know it grants
    // more than the override allows, so it raises the read floor too (the module comment says so).
    shipped(3, false, "workspaceOverride"),
];

/// Whether `sql` only adds: every statement creates a table, creates an index, adds a column that
/// may be empty or has a default (`ALTER TABLE ... ADD [COLUMN]` without `NOT NULL`, or with a
/// `DEFAULT`), or drops an index. A unique index is an addition only on a table the same SQL
/// creates, since on a table that already has rows it refuses an older build's write. **Dropping
/// an index is a relaxation** (effort 857, ticket 33): it takes a rule or a look-up away and
/// refuses no build anything, where every other removal, of a table, a column, a view or a
/// trigger, takes away something an older build reads or writes. Comments are ignored, and
/// statements are split at `;` as `drizzle-kit` writes them.
///
/// **The shape, never the meaning**: a column added with a default can still change what an older
/// build's figures mean, as `0006` does, and that is the declaration's to say.
pub fn addition_sql_is_additive(sql: &str) -> bool {
    let statements = statements(sql);
    let created: Vec<String> = statements
        .iter()
        .filter_map(|words| match words.as_slice() {
            [create, table, rest @ ..] if create == "CREATE" && table == "TABLE" => {
                name_after_if_not_exists(rest)
            }
            _ => None,
        })
        .collect();

    statements.iter().all(|words| only_adds(words, &created))
}

/// Each statement of `sql` as its words, upper-cased, with every identifier unquoted: comments
/// dropped, then split at `;`.
fn statements(sql: &str) -> Vec<Vec<String>> {
    let uncommented: String = sql
        .lines()
        .map(|line| match line.find("--") {
            Some(at) => &line[..at],
            None => line,
        })
        .collect::<Vec<&str>>()
        .join("\n");

    uncommented
        .split(';')
        .map(|statement| {
            statement
                .replace(['(', ')', ','], " ")
                .split_whitespace()
                .map(|word| word.trim_matches(['`', '"', '[', ']']).to_uppercase())
                .collect::<Vec<String>>()
        })
        .filter(|words| !words.is_empty())
        .collect()
}

/// The name that follows, past an `IF NOT EXISTS`.
fn name_after_if_not_exists(words: &[String]) -> Option<String> {
    match words {
        [r#if, not, exists, name, ..] if r#if == "IF" && not == "NOT" && exists == "EXISTS" => {
            Some(name.clone())
        }
        [name, ..] => Some(name.clone()),
        [] => None,
    }
}

/// Whether one statement, as its words, only adds, given the tables the same SQL creates.
fn only_adds(words: &[String], created: &[String]) -> bool {
    let is = |at: usize, word: &str| words.get(at).is_some_and(|found| found == word);

    if is(0, "CREATE") && is(1, "TABLE") {
        return true;
    }

    if is(0, "CREATE") && is(1, "INDEX") {
        return true;
    }

    if is(0, "CREATE") && is(1, "UNIQUE") && is(2, "INDEX") {
        // the table follows `ON`; a unique index only adds on a table this SQL creates.
        return words
            .iter()
            .position(|word| word == "ON")
            .and_then(|at| words.get(at + 1))
            .is_some_and(|table| created.contains(table));
    }

    if is(0, "DROP") && is(1, "INDEX") {
        // the index named, past an `IF EXISTS`; a statement naming none is not one drizzle writes.
        let named = if is(2, "IF") && is(3, "EXISTS") { 4 } else { 2 };

        return words.len() == named + 1;
    }

    if is(0, "ALTER") && is(1, "TABLE") && is(3, "ADD") {
        let column = if is(4, "COLUMN") {
            &words[5..]
        } else {
            &words[4..]
        };
        let not_null = column
            .windows(2)
            .any(|pair| pair[0] == "NOT" && pair[1] == "NULL");
        let defaulted = column.iter().any(|word| word == "DEFAULT");

        return !column.is_empty() && (!not_null || defaulted);
    }

    false
}

#[cfg(test)]
mod tests {
    use super::{
        FORMAT_STEPS, Kind, Ladder, Step, Steps, WORKSPACE_STEPS, addition_sql_is_additive,
    };
    use crate::{
        organization::{lease::apply, store::FORMAT_VERSION},
        upgrade::format::TRANSITIONS,
    };

    /// The SQL of the embedded migration that is step `number`.
    fn migration(number: u32) -> &'static str {
        apply::WORKSPACE_MIGRATIONS[number as usize - 1].1
    }

    /// **Ticket 01's first criterion.** One declaration per embedded migration and per change of
    /// format, so a migration file or a change added without one fails here.
    #[test]
    fn every_migration_and_every_change_of_format_is_declared() {
        assert_eq!(
            WORKSPACE_STEPS.len(),
            apply::WORKSPACE_MIGRATIONS.len(),
            "a workspace migration has no step declared in database/step.rs, or a step no migration"
        );
        assert_eq!(
            FORMAT_STEPS.len(),
            TRANSITIONS.len(),
            "a change of format has no step declared in database/step.rs, or a step no change"
        );
    }

    /// What this build knows is what it ships: the workspace's migration count and the
    /// organization's format.
    #[test]
    fn what_this_build_knows_is_what_it_ships() {
        assert_eq!(
            i64::from(Ladder::Workspace.known()),
            apply::shipped_version()
        );
        assert_eq!(i64::from(Ladder::Format.known()), FORMAT_VERSION);
        assert_eq!(Ladder::Workspace.step(0), None);
        assert_eq!(Ladder::Workspace.step(1), Some(&WORKSPACE_STEPS[0]));
        assert_eq!(Ladder::Format.step(1), None);
        assert_eq!(Ladder::Format.step(2), Some(&FORMAT_STEPS[0]));
        assert_eq!(Ladder::Format.step(Ladder::Format.known() + 1), None);
    }

    /// **Ticket 01's second criterion, over the tables.** Every step declared an addition only
    /// adds, in its SQL: `0007` is the first (ticket 33), and every one after it is checked here.
    #[test]
    fn every_workspace_addition_only_adds() {
        for (index, step) in WORKSPACE_STEPS.iter().enumerate() {
            if step.kind == Kind::Addition {
                let (name, sql) = apply::WORKSPACE_MIGRATIONS[index];

                assert!(
                    addition_sql_is_additive(sql),
                    "{name} is declared an addition and does more than add"
                );
            }
        }
    }

    /// **Ticket 01's second criterion, over the check.** Creating a table or an index, and adding
    /// a column that may be empty or has a default, pass; a drop, a rename, a column `NOT NULL`
    /// with no default, a rebuild and a change of rows each fail.
    #[test]
    fn only_a_table_an_index_or_an_optional_column_is_an_addition() {
        let additive = [
            "CREATE TABLE `refund` (`id` text PRIMARY KEY NOT NULL, `amount` real NOT NULL);",
            "CREATE INDEX `payment_contract_id_idx` ON `payment` (`contract_id`);",
            "create index if not exists \"a\" on \"b\" (\"c\")",
            "ALTER TABLE `payment` ADD `note` text;",
            "ALTER TABLE payment ADD COLUMN note text",
            "ALTER TABLE `payment` ADD `direction` text DEFAULT 'received' NOT NULL;",
            "CREATE TABLE `a` (`id` text NOT NULL);--> statement-breakpoint\n\
             CREATE UNIQUE INDEX `a_id_unique` ON `a` (`id`);",
            "-- a note; with a semicolon in it\nALTER TABLE `payment` ADD `method` text;",
            "",
            // a rule taken away refuses no older build anything (effort 857, ticket 33).
            "DROP INDEX `tenant_phone_unique`;",
            "drop index if exists \"payment_contract_id_idx\"",
            "DROP INDEX `complex_name_unique`;--> statement-breakpoint\n\
             DROP INDEX `tenant_phone_unique`;",
        ];
        let not_additive = [
            ("a drop", "DROP TABLE `payment`;"),
            ("a dropped view", "DROP VIEW `paid`;"),
            ("a dropped trigger", "DROP TRIGGER `t`;"),
            ("an index dropped with no name", "DROP INDEX;"),
            (
                "an index dropped beside a dropped table",
                "DROP INDEX `tenant_phone_unique`;--> statement-breakpoint\nDROP TABLE `tenant`;",
            ),
            (
                "a dropped column",
                "ALTER TABLE `payment` DROP COLUMN `note`;",
            ),
            (
                "a rename",
                "ALTER TABLE `__new_payment` RENAME TO `payment`;",
            ),
            (
                "a renamed column",
                "ALTER TABLE `payment` RENAME COLUMN `note` TO `memo`;",
            ),
            (
                "a NOT NULL column without a default",
                "ALTER TABLE `payment` ADD `direction` text NOT NULL;",
            ),
            (
                "a unique index on a table it did not create",
                "CREATE UNIQUE INDEX `payment_note_unique` ON `payment` (`note`);",
            ),
            ("a change of rows", "UPDATE `payment` SET `note` = '';"),
            (
                "rows written",
                "INSERT INTO `idmap` (\"concept\") SELECT 'tenant' FROM `tenant`;",
            ),
            (
                "an addition beside a drop",
                "ALTER TABLE `payment` ADD `note` text;--> statement-breakpoint\nDROP TABLE `history`;",
            ),
            (
                "a trigger",
                "CREATE TRIGGER `t` AFTER INSERT ON `payment` BEGIN SELECT 1; END;",
            ),
        ];

        for sql in additive {
            assert!(addition_sql_is_additive(sql), "should add only: {sql}");
        }

        for (what, sql) in not_additive {
            assert!(
                !addition_sql_is_additive(sql),
                "{what} passed as an addition: {sql}"
            );
        }
    }

    /// The check over the shipped files: `0004` and `0005` only add, `0003` rebuilds, `0006`
    /// passes on its shape, which is why its declaration rather than its SQL is what keeps it an
    /// upgrade, and `0007` only drops indexes.
    #[test]
    fn the_check_reads_the_shipped_files_as_they_are() {
        assert!(addition_sql_is_additive(migration(5)), "0004 adds an index");
        assert!(
            addition_sql_is_additive(migration(6)),
            "0005 adds three columns"
        );
        assert!(
            addition_sql_is_additive(migration(7)),
            "0006 is additive in shape"
        );
        assert!(
            !addition_sql_is_additive(migration(4)),
            "0003 drops and renames"
        );
        assert!(
            addition_sql_is_additive(migration(8)),
            "0007 drops four indexes"
        );
    }

    /// **Ticket 33's first two criteria, over the declarations** (effort 857, requirement 14).
    /// `0007` takes away the shared database's rule on the four fields a person types, which made
    /// the engine drop one machine's records when two saved the same value apart. It is the first
    /// step declared after 857: an addition, so it moves no floor and runs on open for anyone, and
    /// its SQL is the four `DROP INDEX`es the check admits and nothing else.
    #[test]
    fn the_rules_on_the_four_typed_fields_go_as_an_addition() {
        use crate::database::floor::Floors;

        let step = Ladder::Workspace.step(8).expect("0007 is declared");
        let (name, sql) = apply::WORKSPACE_MIGRATIONS[7];

        assert!(name.starts_with("0007"), "{name}");
        assert_eq!(step.kind, Kind::Addition);
        assert!(!step.shipped_before_857);
        assert!(step.runs_on_open());
        assert_eq!(step.describes, "duplicateValues");
        assert!(addition_sql_is_additive(sql), "{name} does more than add");

        let dropped: Vec<&str> = sql
            .lines()
            .filter_map(|line| line.trim().strip_prefix("DROP INDEX `"))
            .filter_map(|rest| rest.split('`').next())
            .collect();

        assert_eq!(
            dropped,
            [
                "complex_name_unique",
                "contract_gov_id_unique",
                "tenant_national_id_unique",
                "tenant_phone_unique",
            ]
        );

        // it moves neither floor, so every build that reads and writes 7 still does.
        let workspace = Ladder::Workspace.declared();

        assert_eq!(workspace.settled(), 7);
        assert_eq!(workspace.known(), 8);
        assert_eq!(workspace.on_open(7, &[]), vec![8]);
        assert!(workspace.awaiting(Floors::legacy(7)).is_empty());
        assert_eq!(
            workspace.raised(Floors::legacy(7), &[8], 8),
            Floors {
                level: 8,
                read: 7,
                write: 7
            }
        );
        assert_eq!(
            workspace.legacy_after(7, workspace.raised(Floors::legacy(7), &[8], 8)),
            7
        );
    }

    /// **Ticket 01's third criterion.** Every step shipped before effort 857 is an upgrade whose
    /// floors are its own number, `0006` and format 3 included as their meaning requires; only the
    /// change that re-signs every row needs the owner. The steps declared after it are their own
    /// tickets' to say.
    #[test]
    fn every_shipped_step_is_an_upgrade_at_its_own_number() {
        for ladder in [Ladder::Workspace, Ladder::Format] {
            for (index, step) in ladder
                .steps()
                .iter()
                .enumerate()
                .filter(|(_, step)| step.shipped_before_857)
            {
                let number = ladder.first() + index as u32;

                assert_eq!(
                    step.kind,
                    Kind::Upgrade {
                        read_floor: Some(number),
                        write_floor: Some(number),
                        needs_owner: ladder == Ladder::Format && number == 2,
                    },
                    "{ladder:?} step {number}"
                );
            }
        }

        let direction = Ladder::Workspace.step(7).expect("0006");
        let overriding = Ladder::Format.step(3).expect("format 3");

        assert_eq!(direction.describes, "paymentDirection");
        assert!(matches!(
            direction.kind,
            Kind::Upgrade {
                read_floor: Some(7),
                write_floor: Some(7),
                needs_owner: false
            }
        ));
        assert_eq!(overriding.describes, "workspaceOverride");
        assert!(matches!(
            overriding.kind,
            Kind::Upgrade {
                read_floor: Some(3),
                write_floor: Some(3),
                needs_owner: false
            }
        ));
    }

    /// Every step says what it does, under a key of its own.
    #[test]
    fn every_step_names_its_own_sentence() {
        let keys: Vec<&str> = WORKSPACE_STEPS
            .iter()
            .chain(FORMAT_STEPS)
            .map(|step: &Step| step.describes)
            .collect();
        let mut unique = keys.clone();

        unique.sort();
        unique.dedup();

        assert_eq!(
            unique.len(),
            keys.len(),
            "two steps share a sentence: {keys:?}"
        );
        assert!(keys.iter().all(|key| !key.is_empty()));
    }

    /// **Ticket 07's constraint.** Every step's sentence is written, in English and in Arabic: its
    /// `describes` key stands under `organization.upgrade.steps` in both of the organization's
    /// locale files, which is what the upgrade sheet reads.
    #[test]
    fn every_step_says_what_it_does_in_both_languages() {
        for locale in ["en", "ar"] {
            let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join(format!("../src/lib/organization/i18n/{locale}.ts"));
            let source = std::fs::read_to_string(&path).expect("the locale");
            let upgrade = source
                .find("\tupgrade: {")
                .unwrap_or_else(|| panic!("{locale} has no `organization.upgrade`"));
            let steps = upgrade
                + source[upgrade..]
                    .find("steps: {")
                    .unwrap_or_else(|| panic!("{locale} has no `organization.upgrade.steps`"));
            let block = &source[steps..steps + source[steps..].find('}').expect("its end")];

            for step in WORKSPACE_STEPS.iter().chain(FORMAT_STEPS) {
                assert!(
                    block.contains(&format!("\t{}:", step.describes)),
                    "{locale} says nothing for {}",
                    step.describes
                );
            }
        }
    }

    /// A step declared after effort 857, of `kind`.
    const fn after(kind: Kind, describes: &'static str) -> Step {
        Step {
            kind,
            describes,
            shipped_before_857: false,
        }
    }

    /// An upgrade declared after effort 857, raising the write floor to `number`.
    const fn upgrade(number: u32, describes: &'static str) -> Step {
        after(
            Kind::Upgrade {
                read_floor: None,
                write_floor: Some(number),
                needs_owner: false,
            },
            describes,
        )
    }

    /// **Ticket 03's first criterion, over the declarations.** Every step shipped before 857
    /// carries the mark and runs on open, on both ladders, so the open path runs them as 0.20 did;
    /// the run of them ends at the workspace's `0006` and the organization's format 3; and no step
    /// declared after carries it, `0007` the first of them.
    #[test]
    fn every_step_shipped_before_857_is_marked_and_runs_on_open() {
        let shipped_through = |ladder: Ladder| match ladder {
            Ladder::Workspace => 7,
            Ladder::Format => 3,
        };

        for ladder in [Ladder::Workspace, Ladder::Format] {
            for (index, step) in ladder.steps().iter().enumerate() {
                let number = ladder.first() + index as u32;

                assert_eq!(
                    step.shipped_before_857,
                    number <= shipped_through(ladder),
                    "{ladder:?} step {number} is marked wrongly"
                );

                if step.shipped_before_857 {
                    assert!(step.runs_on_open());
                }
            }

            assert_eq!(ladder.declared().settled(), shipped_through(ladder));
            assert_eq!(ladder.declared().known(), ladder.known());
        }

        // a workspace at 5 runs 6 and 7 on open, and every addition after them; an organization
        // at format 1 runs 2 and 3.
        let after_0006: Vec<u32> = (8..=Ladder::Workspace.known())
            .filter(|number| {
                Ladder::Workspace
                    .step(*number)
                    .is_some_and(Step::runs_on_open)
            })
            .collect();

        assert_eq!(
            Ladder::Workspace.declared().on_open(5, &[]),
            [vec![6, 7], after_0006.clone()].concat()
        );
        assert_eq!(Ladder::Format.declared().on_open(1, &[]), vec![2, 3]);
        assert_eq!(Ladder::Workspace.declared().on_open(7, &[]), after_0006);
    }

    /// **Ticket 03's last criterion, over the declarations.** After the steps shipped before 857,
    /// an upgrade declared later waits for the explicit act and an addition after it still runs;
    /// one already applied above the level runs again never; and the settled run stops at the
    /// first step declared after.
    #[test]
    fn opening_passes_over_a_later_upgrade_and_runs_the_additions_after_it() {
        const DECLARED: &[Step] = &[
            WORKSPACE_STEPS[0],
            WORKSPACE_STEPS[1],
            upgrade(3, "aLaterUpgrade"),
            after(Kind::Addition, "aLaterAddition"),
            after(Kind::Addition, "anotherLaterAddition"),
        ];
        let steps = Steps {
            first: 1,
            declared: DECLARED,
        };

        assert_eq!(steps.known(), 5);
        assert_eq!(steps.settled(), 2);
        assert_eq!(steps.on_open(0, &[]), vec![1, 2, 4, 5]);
        assert_eq!(steps.on_open(2, &[]), vec![4, 5]);
        assert_eq!(steps.on_open(2, &[4]), vec![5]);
        assert!(steps.on_open(2, &[4, 5]).is_empty());
        assert!(steps.on_open(5, &[]).is_empty());
        assert!(!DECLARED[2].runs_on_open());
        assert!(DECLARED[3].runs_on_open());
    }

    /// **Ticket 07, over the declarations.** An upgrade declared after 857 waits while the floors
    /// are below what it declares and stops waiting once they are not; the floors it leaves are its
    /// own over what stood; and the number builds before 857 read moves only where a floor passes
    /// the last step they know, and then to that floor.
    #[test]
    fn an_upgrade_waits_until_the_floors_say_it_ran_and_moves_the_legacy_number_only_past_857() {
        use crate::database::floor::Floors;

        const DECLARED: &[Step] = &[
            WORKSPACE_STEPS[0],
            WORKSPACE_STEPS[1],
            upgrade(3, "aLaterUpgrade"),
            after(Kind::Addition, "aLaterAddition"),
            after(
                Kind::Upgrade {
                    read_floor: Some(5),
                    write_floor: Some(5),
                    needs_owner: true,
                },
                "anOwnersUpgrade",
            ),
        ];
        let steps = Steps {
            first: 1,
            declared: DECLARED,
        };
        let shipped = Floors::legacy(2);

        assert_eq!(steps.awaiting(shipped), vec![3, 5]);
        assert_eq!(
            steps.awaiting(Floors {
                level: 4,
                read: 2,
                write: 3
            }),
            vec![5]
        );
        assert!(
            steps
                .awaiting(Floors {
                    level: 5,
                    read: 5,
                    write: 5
                })
                .is_empty()
        );
        assert!(steps.need_the_owner(&[3, 5]));
        assert!(!steps.need_the_owner(&[3, 4]));

        let raised = steps.raised(shipped, &[3, 4], 4);

        assert_eq!(
            raised,
            Floors {
                level: 4,
                read: 2,
                write: 3
            }
        );
        assert_eq!(
            steps.raised(raised, &[5], 5),
            Floors {
                level: 5,
                read: 5,
                write: 5
            }
        );

        // past the last step builds before 857 know, which is 2 here: moved, to the higher floor.
        assert_eq!(steps.legacy_after(2, raised), 3);
        // a floor that passes nothing they know moves nothing.
        assert_eq!(steps.legacy_after(2, Floors::legacy(2)), 2);
        // and a number already past them stays where it is.
        assert_eq!(steps.legacy_after(3, Floors::legacy(5)), 3);
    }

    /// **Ticket 21, over the declarations.** Data created from nothing runs every step, and is
    /// born with the floors those steps declare, never at its level: the shipped ladders give
    /// exactly what their legacy numbers read as, an addition declared after 857 raises nothing,
    /// and an upgrade declared after it raises what it declares. The number builds before 857 read
    /// stays at the last step they know unless a declared floor passes it.
    #[test]
    fn new_data_is_born_with_the_floors_its_steps_declare() {
        use crate::database::floor::{Floors, Standing};

        let workspace = Ladder::Workspace.declared();
        let format = Ladder::Format.declared();

        // the workspace's ladder ends in `0007`, an addition: born at its level, with the floors
        // `0006` declares, and the number builds before 857 read at 7, which they open.
        assert_eq!(
            workspace.born(),
            Floors {
                level: workspace.known(),
                read: 7,
                write: 7
            }
        );
        assert_eq!(workspace.born_legacy(), 7);
        assert_eq!(format.born(), Floors::legacy(3));
        assert_eq!(format.born_legacy(), 3);

        const WITH_AN_ADDITION: &[Step] = &[
            WORKSPACE_STEPS[0],
            WORKSPACE_STEPS[1],
            after(Kind::Addition, "aLaterAddition"),
        ];
        let added = Steps {
            first: 1,
            declared: WITH_AN_ADDITION,
        };

        assert_eq!(
            added.born(),
            Floors {
                level: 3,
                read: 2,
                write: 2
            }
        );
        assert_eq!(added.born_legacy(), 2);
        assert_eq!(added.born().standing(2), Standing::Writable);

        const WITH_AN_UPGRADE: &[Step] = &[
            WORKSPACE_STEPS[0],
            WORKSPACE_STEPS[1],
            after(Kind::Addition, "aLaterAddition"),
            after(
                Kind::Upgrade {
                    read_floor: None,
                    write_floor: Some(4),
                    needs_owner: false,
                },
                "aLaterUpgrade",
            ),
        ];
        let upgraded = Steps {
            first: 1,
            declared: WITH_AN_UPGRADE,
        };

        assert_eq!(
            upgraded.born(),
            Floors {
                level: 4,
                read: 2,
                write: 4
            }
        );
        // the write floor passes every build before 857, so their number stops them.
        assert_eq!(upgraded.born_legacy(), 4);
        assert_eq!(upgraded.born().standing(3), Standing::ReadOnly);
    }
}
