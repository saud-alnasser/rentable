//! identical records made apart heal into one (effort 857, requirement 14, ticket 35).
//!
//! **Why there are copies at all.** The shared database holds no rule on a tenant's phone and
//! national ID, a complex's name or a contract's government ID since `0007`, because the engine
//! dropped one machine's records when it refused them. So two machines saving the same tenant
//! while apart make two records, and nothing the person did was wrong. The app keeps those values
//! unique when a person saves; this is what makes the copies it could not stop into one, without
//! anybody noticing.
//!
//! **What it does, once per pass**, for each kind in turn, a record's parent before its children:
//! complexes, their units, tenants, their contracts, and the contracts' payments.
//!
//! 1. **Carries** a change that arrived for a retired record to the record it went into. A machine
//!    that had not heard of the merge can still edit the copy it holds. `merged_as` holds the
//!    retired record's fields as they stood when it last matched its survivor, so a field the
//!    retired record changed since, which the survivor still holds as it was, is the survivor's
//!    now. A field both changed keeps the survivor's: it is the one everybody sees.
//! 2. **Retires a copy** of a tenant, a complex or a contract: every record the same as an earlier
//!    one in every field a person entered, sharing the value the app keeps unique, a contract its
//!    units too. The earliest stays, by its id, which leads with the moment it was made (UUIDv7),
//!    and every later one gets `merged_into`, naming it, and `merged_as`. Nothing is deleted.
//! 3. **Heals the children of a copy one to one.** A unit, a contract or a payment left under a
//!    retired parent is the same as one under the record that stayed, in every field a person
//!    entered, or it is not. Each one that is pairs with one of the survivor's that it has not
//!    paired with yet, and is retired into it, so two machines that saved one complex with its
//!    units, or one contract with its payment, end with those once, and a paid amount does not
//!    double. Each one that is not moves to the survivor, and is counted once.
//! 4. **Moves** what else points at a retired record to the one it went into: the history of each,
//!    a contract's units, where a unit the contract that stayed already holds is not held twice,
//!    and the contract a contract renews (effort 861, ticket 10), so the contract that stayed keeps
//!    the renewal made of its copy. This runs on every pass, so a reference a machine that had not
//!    heard of the merge made later moves too.
//!
//! **What a person entered** is every column but `id`, `merged_into` and `merged_as`, and those the
//! application derives from the rest: a unit's status, which its contracts decide, and a contract's
//! paid and expected amounts and its status, which its payments and its terms decide. Of a
//! contract's status only whether somebody terminated it is entered, so that is all of it compared
//! and carried. Nothing the application derives is compared or carried, since a machine
//! reconciling a copy it still shows moves it without anybody entering anything. The columns are
//! read off the table rather than listed, so a column added later is compared from the day it
//! lands. A record's parent is compared as the record that parent finally went into, and the
//! contract a contract renews as the contract that one finally went into. That one is of the same
//! kind, so it may be retired in the same pass: steps 2 and 3 run again while a round retires a
//! contract, and two renewals of two copies made apart pair in the pass that makes the copies one.
//!
//! **A contract that names none it renews pairs with a copy that names one** (effort 861, ticket
//! 18): one machine's reconcile may link its copy before the copies meet, and an older build links
//! none. Two that name one pair only where it is the same contract, a copy pairs first with one
//! naming what it names, and neither may name the other. The contract that stayed names what
//! either named, whichever of them stayed, which is counted as carried.
//!
//! **A copy whose record is gone is shown again.** A build that does not know a copy was retired
//! shows both, and a person there may delete the one that stayed as the duplicate it looks like.
//! The copy is the record then, so it is retired into nothing.
//!
//! **The same on every machine.** What a pass does is decided only by what the workspace holds,
//! with every record read in the order of its id, and a record retired twice points at the one it
//! finally went into. So two machines that pulled the same rows heal them the same way, their
//! writes are the same values, and either order of their pushes leaves one survivor and nothing
//! lost. A pass over a healed workspace finds nothing, and writes nothing.
//!
//! **Where it runs** is the caller's: after the pull and its verdict, under the same hold of the
//! engine, where this build may write the workspace (`Database::heal`). Every read of the
//! application keeps a retired record out (`src/lib/platform/database/retired.ts`).

use std::collections::{BTreeMap, HashMap, HashSet};

use serde_json::{Map, Value as Json};

use crate::error::Error;

/// A kind of record that heals.
struct Kind {
    /// its table, which is also the name its history entries are kept under.
    table: &'static str,
    /// the column whose value two copies share, where the kind is one a person keeps unique.
    shared: Option<&'static str>,
    /// the column naming its parent, and the parent's table, where it is a child of a kind that
    /// heals.
    parent: Option<(&'static str, &'static str)>,
    /// the column naming another record of the same kind, as a contract names the contract it
    /// renews: compared as the record that one finally went into, and moved to it.
    kin: Option<&'static str>,
    /// the columns the application derives, which no person entered.
    derived: &'static [&'static str],
    /// a column the application derives but for one value of it a person sets, which is all of it
    /// that is compared and carried.
    entered: Option<Entered>,
}

/// A column the application derives but for the one value a person sets, as a contract's status
/// is: its term and its payments decide it, unless somebody terminated it.
#[derive(Clone, Copy)]
struct Entered {
    column: &'static str,
    /// the value a person sets, which reads as itself; every other value reads as empty.
    value: &'static str,
    /// what a record that loses that value is written as, which the reconcile after a pass that
    /// wrote derives the rest from.
    otherwise: &'static str,
}

impl Entered {
    /// What a person entered of `value`: the value a person sets, or nothing.
    fn of(&self, value: turso::Value) -> turso::Value {
        match value {
            turso::Value::Text(text) if text == self.value => turso::Value::Text(text),
            _ => turso::Value::Null,
        }
    }

    /// What the column is written as to hold `value`, as [`Entered::of`] reads it.
    fn written(&self, value: &turso::Value) -> turso::Value {
        match value {
            turso::Value::Null => text(self.otherwise),
            other => other.clone(),
        }
    }
}

/// Every kind that heals, a parent before its children.
const KINDS: [Kind; 5] = [
    Kind {
        table: "complex",
        shared: Some("name"),
        parent: None,
        kin: None,
        derived: &[],
        entered: None,
    },
    Kind {
        table: "unit",
        shared: None,
        parent: Some(("complex_id", "complex")),
        kin: None,
        derived: &["status"],
        entered: None,
    },
    Kind {
        table: "tenant",
        shared: Some("phone"),
        parent: None,
        kin: None,
        derived: &[],
        entered: None,
    },
    Kind {
        table: "contract",
        shared: Some("gov_id"),
        parent: Some(("tenant_id", "tenant")),
        kin: Some("renews_contract_id"),
        derived: &["paid_amount", "expected_amount"],
        entered: Some(Entered {
            column: "status",
            value: "terminated",
            otherwise: "active",
        }),
    },
    Kind {
        table: "payment",
        shared: None,
        parent: Some(("contract_id", "contract")),
        kin: None,
        derived: &[],
        entered: None,
    },
];

/// The columns that are no field a person entered, on every kind.
const NOT_ENTERED: [&str; 3] = ["id", "merged_into", "merged_as"];

/// What one pass did.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct Healed {
    /// records retired as copies of another.
    pub retired: usize,
    /// references moved from a retired record to the one it went into.
    pub moved: usize,
    /// records that stayed and took a change made to a copy retired into them.
    pub carried: usize,
    /// retired records shown again, the record they went into being gone.
    pub shown: usize,
    /// every statement the pass wrote.
    pub written: usize,
}

impl Healed {
    /// Whether the pass wrote anything.
    pub(crate) fn changed(&self) -> bool {
        self.written > 0
    }
}

/// One record as a pass reads it.
#[derive(Clone, Debug)]
struct Record {
    id: String,
    merged_into: Option<String>,
    merged_as: Option<String>,
    /// every field a person entered, in the table's order, its parent as the record that parent
    /// finally went into.
    fields: Vec<turso::Value>,
    /// its parent as it names it, where it has one.
    parent: Option<String>,
    /// the record of its own kind it names as it names it, where it names one (`Kind::kin`).
    kin: Option<String>,
}

/// A statement a pass writes, and its parameters.
type Statement = (String, Vec<turso::Value>);

/// What a pass plans, before anything is written.
#[derive(Default)]
struct Plan {
    statements: Vec<Statement>,
    healed: Healed,
}

impl Plan {
    /// Retire `copy` of `table` into `survivor`, and every record retired into it before along
    /// with it.
    fn retire(
        &mut self,
        table: &str,
        copy: &str,
        survivor: &str,
        merged_as: String,
        targets: &mut BTreeMap<String, String>,
    ) {
        self.statements.push((
            format!(
                "UPDATE \"{table}\" SET \"merged_into\" = ?, \"merged_as\" = ? WHERE \"id\" = ?"
            ),
            vec![text(survivor), turso::Value::Text(merged_as), text(copy)],
        ));
        self.healed.retired += 1;

        for (id, target) in targets.iter_mut() {
            if target == copy {
                *target = survivor.to_string();
                self.statements.push((
                    format!("UPDATE \"{table}\" SET \"merged_into\" = ? WHERE \"id\" = ?"),
                    vec![text(survivor), text(id)],
                ));
            }
        }

        targets.insert(copy.to_string(), survivor.to_string());
    }
}

fn text(value: &str) -> turso::Value {
    turso::Value::Text(value.to_string())
}

/// Heal the workspace on `connection`, which must be one that may write: carry, retire, pair and
/// move as this module says, every write in one transaction. Reads first, and writes nothing
/// where there is nothing to heal.
pub(crate) async fn pass(connection: &turso::Connection) -> Result<Healed, Error> {
    let plan = planned(connection).await?;

    if plan.statements.is_empty() {
        return Ok(plan.healed);
    }

    written(connection, plan.statements).await?;

    Ok(plan.healed)
}

/// Whether `sql` may write a record of a kind that heals: it names one of their tables and a word
/// that writes. Read loosely, since what it decides is only whether a pass is owed.
pub(crate) fn may_write_a_retirable(sql: &str) -> bool {
    let sql = sql.to_ascii_lowercase();
    let words: Vec<&str> = sql
        .split(|character: char| !character.is_ascii_alphanumeric() && character != '_')
        .collect();

    words
        .iter()
        .any(|word| matches!(*word, "insert" | "update" | "delete" | "replace"))
        && KINDS.iter().any(|kind| words.contains(&kind.table))
}

/// Whether the workspace on `connection` holds a record retired as a copy, of any kind that heals.
pub(crate) async fn holds_a_retired(connection: &turso::Connection) -> Result<bool, Error> {
    let any: Vec<String> = KINDS
        .iter()
        .map(|kind| {
            format!(
                "EXISTS (SELECT 1 FROM \"{}\" WHERE \"merged_into\" IS NOT NULL)",
                kind.table
            )
        })
        .collect();
    let mut rows = connection
        .query(format!("SELECT {}", any.join(" OR ")), ())
        .await?;

    Ok(match rows.next().await? {
        Some(row) => matches!(row.get_value(0)?, turso::Value::Integer(held) if held != 0),
        None => false,
    })
}

/// What a pass over the workspace on `connection` would write, read and decided, nothing written.
async fn planned(connection: &turso::Connection) -> Result<Plan, Error> {
    let mut plan = Plan::default();
    // every retired record of each kind, by its id, and the record it finally went into.
    let mut survivors: HashMap<&'static str, BTreeMap<String, String>> = HashMap::new();

    for kind in &KINDS {
        let targets = kind_healed(connection, kind, &survivors, &mut plan).await?;

        history_moved(connection, kind.table, &targets, &mut plan).await?;
        survivors.insert(kind.table, targets);
    }

    links_moved(connection, &survivors, &mut plan).await?;

    plan.healed.written = plan.statements.len();

    Ok(plan)
}

/// Carry, retire and pair the records of `kind`, given the survivors of the kinds before it, and
/// answer every retired record of it with the one it finally went into.
async fn kind_healed(
    connection: &turso::Connection,
    kind: &Kind,
    survivors: &HashMap<&'static str, BTreeMap<String, String>>,
    plan: &mut Plan,
) -> Result<BTreeMap<String, String>, Error> {
    let table = kind.table;
    let columns = fields_of(connection, table, kind.derived).await?;
    let position = |name: &str| columns.iter().position(|column| column == name);
    let parent_at = kind.parent.and_then(|(column, _)| position(column));
    let kin_at = kind.kin.and_then(position);
    let parents: BTreeMap<String, String> = kind
        .parent
        .and_then(|(_, of)| survivors.get(of).cloned())
        .unwrap_or_default();
    let normalized = |mut fields: Vec<turso::Value>| {
        if let Some(at) = parent_at
            && let turso::Value::Text(parent) = &fields[at]
            && let Some(survivor) = parents.get(parent)
        {
            fields[at] = turso::Value::Text(survivor.clone());
        }
        fields
    };

    let mut live: BTreeMap<String, Record> = BTreeMap::new();
    let mut retired: BTreeMap<String, Record> = BTreeMap::new();

    let entered = kind
        .entered
        .and_then(|entered| Some((position(entered.column)?, entered)));

    for mut record in records_of(connection, table, &columns).await? {
        if let Some((at, entered)) = entered {
            record.fields[at] = entered.of(std::mem::replace(
                &mut record.fields[at],
                turso::Value::Null,
            ));
        }

        let named = |at: usize| match &record.fields[at] {
            turso::Value::Text(named) => Some(named.clone()),
            _ => None,
        };
        let parent = parent_at.and_then(named);
        let kin = kin_at.and_then(named);
        let record = Record {
            fields: normalized(record.fields),
            parent,
            kin,
            ..record
        };

        if record.merged_into.is_some() {
            retired.insert(record.id.clone(), record);
        } else {
            live.insert(record.id.clone(), record);
        }
    }

    // 1. carry: every retired record into the live one it finally went into. One whose record is
    // gone, deleted by a build that showed it as a copy, is the record now, and is shown again.
    let mut targets: BTreeMap<String, String> = BTreeMap::new();
    let mut gone: Vec<String> = Vec::new();

    for id in retired.keys() {
        match final_target(id, &retired, &live) {
            Some(target) => {
                targets.insert(id.clone(), target);
            }
            None => gone.push(id.clone()),
        }
    }

    for id in gone {
        let Some(record) = retired.remove(&id) else {
            continue;
        };

        plan.statements.push((
            format!(
                "UPDATE \"{table}\" SET \"merged_into\" = NULL, \"merged_as\" = NULL WHERE \"id\" = ?"
            ),
            vec![text(&id)],
        ));
        plan.healed.shown += 1;
        live.insert(
            id,
            Record {
                merged_into: None,
                merged_as: None,
                ..record
            },
        );
    }

    // the record of this kind a record names is compared as the one it finally went into.
    for record in live.values_mut().chain(retired.values_mut()) {
        kin_normalized(&mut record.fields, kin_at, &targets);
    }

    let mut changed: BTreeMap<String, Vec<usize>> = BTreeMap::new();
    let mut rewritten: Vec<(String, String)> = Vec::new();

    for (id, target) in &targets {
        let record = &retired[id];
        let baseline = record
            .merged_as
            .as_deref()
            .and_then(|merged_as| fields_from(merged_as, &columns))
            .map(&normalized)
            .map(|mut baseline| {
                kin_normalized(&mut baseline, kin_at, &targets);
                baseline
            });

        if let Some(baseline) = &baseline
            && let Some(survivor) = live.get_mut(target)
        {
            for (at, field) in record.fields.iter().enumerate() {
                if field != &baseline[at] && survivor.fields[at] == baseline[at] {
                    survivor.fields[at] = field.clone();
                    changed.entry(target.clone()).or_default().push(at);
                }
            }
        }

        let merged_as = snapshot(&columns, &record.fields);

        if record.merged_as.as_deref() != Some(merged_as.as_str())
            || record.merged_into.as_deref() != Some(target.as_str())
        {
            plan.statements.push((
                format!(
                    "UPDATE \"{table}\" SET \"merged_into\" = ?, \"merged_as\" = ? WHERE \"id\" = ?"
                ),
                vec![
                    text(target),
                    turso::Value::Text(merged_as.clone()),
                    text(id),
                ],
            ));
            rewritten.push((id.clone(), merged_as));
        }
    }

    for (id, merged_as) in rewritten {
        if let Some(record) = retired.get_mut(&id) {
            record.merged_as = Some(merged_as);
        }
    }

    for (id, at) in &changed {
        let survivor = &live[id];
        let mut set: Vec<usize> = at.clone();

        set.sort_unstable();
        set.dedup();

        let assignments: Vec<String> = set
            .iter()
            .map(|at| format!("\"{}\" = ?", columns[*at]))
            .collect();
        let mut params: Vec<turso::Value> = set
            .iter()
            .map(|at| match entered {
                Some((column, entered)) if column == *at => entered.written(&survivor.fields[*at]),
                _ => survivor.fields[*at].clone(),
            })
            .collect();

        params.push(text(id));
        plan.statements.push((
            format!(
                "UPDATE \"{table}\" SET {} WHERE \"id\" = ?",
                assignments.join(", ")
            ),
            params,
        ));
        plan.healed.carried += 1;
    }

    // what makes two records of this kind the same: every field a person entered, and a
    // contract's units, each as the unit it finally went into.
    let units = if table == "contract" {
        units_of(connection, survivors.get("unit")).await?
    } else {
        HashMap::new()
    };
    // The record of its own kind it names is no part of that: two copies pair where one names it
    // and the other names nothing yet, and only where both name one must it be the same one
    // (`kin_fits`, effort 861, ticket 18).
    let key_of = |id: &str, record: &Record| {
        let mut fields = record.fields.clone();

        if let Some(at) = kin_at {
            fields[at] = turso::Value::Null;
        }

        let mut key = snapshot(&columns, &fields);

        if let Some(held) = units.get(id) {
            key.push_str(&held.join(","));
        }

        key
    };

    // the survivor's children each retired parent has paired with already.
    let mut used: HashSet<(String, String)> = retired
        .iter()
        .filter_map(|(id, record)| Some((record.parent.clone()?, targets.get(id)?.clone())))
        .collect();

    // 2 and 3, again while a round retires a record where this kind names its own: two records
    // naming two copies are the same only once one copy is retired into the other.
    loop {
        let before = targets.len();

        // 2. retire every copy of a record a person keeps unique into the earliest.
        if let Some(at) = kind.shared.and_then(position) {
            let mut groups: BTreeMap<String, Vec<String>> = BTreeMap::new();

            kin_renormalized(&mut live, kin_at, &targets);

            for (id, record) in &live {
                if !matches!(record.fields[at], turso::Value::Null) {
                    groups
                        .entry(key_of(id, record))
                        .or_default()
                        .push(id.clone());
                }
            }

            for ids in groups.values().filter(|ids| ids.len() > 1) {
                // `live` is read in the order of its ids, so the first of each is the earliest.
                for ids in kin_clusters(ids, &live, kin_at) {
                    for copy in &ids[1..] {
                        let merged_as = snapshot(&columns, &live[copy].fields);

                        kin_taken(table, &columns, kin_at, &mut live, &ids[0], copy, plan);
                        plan.retire(table, copy, &ids[0], merged_as.clone(), &mut targets);
                        set_aside(&mut live, &mut retired, copy, &ids[0], merged_as);
                    }
                }
            }
        }

        // 3. heal the children of a retired parent one to one with the survivor's.
        if let Some((column, _)) = kind.parent {
            // the survivor's children, by the parent they are under and what they are.
            let mut kept: BTreeMap<(String, String), Vec<String>> = BTreeMap::new();
            // the children of a retired parent, by that parent.
            let mut orphans: BTreeMap<String, Vec<String>> = BTreeMap::new();

            kin_renormalized(&mut live, kin_at, &targets);

            for (id, record) in &live {
                match &record.parent {
                    Some(parent) if parents.contains_key(parent) => {
                        orphans.entry(parent.clone()).or_default().push(id.clone());
                    }
                    Some(parent) => kept
                        .entry((parent.clone(), key_of(id, record)))
                        .or_default()
                        .push(id.clone()),
                    None => {}
                }
            }

            for (parent, mut children) in orphans {
                let survivor = parents[&parent].clone();
                // whether a child with no partner moves: not while one more round can pair it,
                // where a child retired makes another name the record its partner names, and then
                // in order, so each pairs with one moved before it, or moves.
                let mut moving = false;

                loop {
                    let before = children.len();
                    let mut unpaired = Vec::new();

                    kin_renormalized(&mut live, kin_at, &targets);

                    for child in children {
                        let key = key_of(&child, &live[&child]);
                        let named = kin_of(&live[&child], kin_at);
                        // the first naming what the child names, or, once a round pairs no more
                        // that way, the first it fits (`kin_fits`).
                        let partner = kept.get(&(survivor.clone(), key.clone())).and_then(|list| {
                            let fitting = |kept: &&String| {
                                let kin = kin_of(&live[*kept], kin_at);

                                !used.contains(&(parent.clone(), (*kept).clone()))
                                    && kin_fits(kept, &kin, &child, &named)
                                    && (moving || kin == named)
                            };
                            let exact = |kept: &&String| kin_of(&live[*kept], kin_at) == named;

                            list.iter()
                                .filter(fitting)
                                .find(exact)
                                .or_else(|| list.iter().find(fitting))
                                .cloned()
                        });

                        match partner {
                            Some(partner) => {
                                used.insert((parent.clone(), partner.clone()));

                                let merged_as = snapshot(&columns, &live[&child].fields);

                                kin_taken(
                                    table, &columns, kin_at, &mut live, &partner, &child, plan,
                                );
                                plan.retire(
                                    table,
                                    &child,
                                    &partner,
                                    merged_as.clone(),
                                    &mut targets,
                                );
                                set_aside(&mut live, &mut retired, &child, &partner, merged_as);
                            }
                            None if moving => {
                                plan.statements.push((
                                    format!(
                                        "UPDATE \"{table}\" SET \"{column}\" = ? WHERE \"id\" = ?"
                                    ),
                                    vec![text(&survivor), text(&child)],
                                ));
                                plan.healed.moved += 1;

                                if let Some(record) = live.get_mut(&child) {
                                    record.parent = Some(survivor.clone());
                                }

                                kept.entry((survivor.clone(), key)).or_default().push(child);
                            }
                            None => unpaired.push(child),
                        }
                    }

                    if moving {
                        break;
                    }

                    moving = kin_at.is_none() || unpaired.len() == before;
                    children = unpaired;
                }
            }
        }

        if kin_at.is_none() || targets.len() == before {
            break;
        }
    }

    // 4. what a record of this kind names of its own: every retired record holds what it was
    // with it as the record it finally went into, and every record names that one.
    if let Some(at) = kin_at {
        for (id, record) in &retired {
            let mut fields = record.fields.clone();

            kin_normalized(&mut fields, kin_at, &targets);

            let merged_as = snapshot(&columns, &fields);

            if record.merged_as.as_deref() != Some(merged_as.as_str()) {
                plan.statements.push((
                    format!("UPDATE \"{table}\" SET \"merged_as\" = ? WHERE \"id\" = ?"),
                    vec![turso::Value::Text(merged_as), text(id)],
                ));
            }
        }

        kin_moved(
            table,
            &columns[at],
            live.values().chain(retired.values()),
            &targets,
            plan,
        );
    }

    Ok(targets)
}

/// Keep `copy`, retired into `survivor` as `merged_as`, among the `retired` rather than the
/// `live`.
fn set_aside(
    live: &mut BTreeMap<String, Record>,
    retired: &mut BTreeMap<String, Record>,
    copy: &str,
    survivor: &str,
    merged_as: String,
) {
    if let Some(record) = live.remove(copy) {
        retired.insert(
            copy.to_string(),
            Record {
                merged_into: Some(survivor.to_string()),
                merged_as: Some(merged_as),
                ..record
            },
        );
    }
}

/// `fields` with the record of its own kind they name, at `at`, as the one it finally went into,
/// given every retired record of the kind by its id (`targets`).
fn kin_normalized(
    fields: &mut [turso::Value],
    at: Option<usize>,
    targets: &BTreeMap<String, String>,
) {
    if let Some(at) = at
        && let turso::Value::Text(named) = &fields[at]
        && let Some(target) = targets.get(named)
    {
        fields[at] = turso::Value::Text(target.clone());
    }
}

/// The record of its own kind `record` names, at `at`, as the pass reads it: empty where the kind
/// names none.
fn kin_of(record: &Record, at: Option<usize>) -> turso::Value {
    at.map_or(turso::Value::Null, |at| record.fields[at].clone())
}

/// Whether records `one` and `other`, alike in all else, may pair by what of their own kind they
/// name: one naming nothing fits any, as a copy a machine linked before the copies met fits one
/// another machine had not linked yet, or an older build made, and two naming one must name the
/// same. Neither may name the other, which pairing would make a record name itself.
fn kin_fits(one: &str, one_named: &turso::Value, other: &str, other_named: &turso::Value) -> bool {
    let names =
        |named: &turso::Value, id: &str| matches!(named, turso::Value::Text(named) if named == id);

    !names(one_named, other)
        && !names(other_named, one)
        && (matches!(one_named, turso::Value::Null)
            || matches!(other_named, turso::Value::Null)
            || one_named == other_named)
}

/// `ids`, records alike in all but what of their own kind they name, in the order of their ids,
/// as the sets that pair: each joins the first set naming what it names, or else the first whose
/// every record it fits (`kin_fits`), or starts one, and a set naming nothing names what the first
/// to name one names. So each set's first is its earliest, and two naming two records are never
/// in one.
fn kin_clusters(
    ids: &[String],
    live: &BTreeMap<String, Record>,
    at: Option<usize>,
) -> Vec<Vec<String>> {
    let mut clusters: Vec<(turso::Value, Vec<String>)> = Vec::new();

    for id in ids {
        let named = kin_of(&live[id], at);
        let fits = |members: &[String]| {
            members
                .iter()
                .all(|member| kin_fits(member, &kin_of(&live[member], at), id, &named))
        };
        let joined = clusters
            .iter()
            .position(|(link, members)| *link == named && fits(members))
            .or_else(|| clusters.iter().position(|(_, members)| fits(members)));

        match joined {
            Some(joined) => {
                let (link, members) = &mut clusters[joined];

                if matches!(link, turso::Value::Null) {
                    *link = named;
                }

                members.push(id.clone());
            }
            None => clusters.push((named, vec![id.clone()])),
        }
    }

    clusters.into_iter().map(|(_, members)| members).collect()
}

/// Where `copy`, about to be retired into `survivor`, names a record of its own kind and the
/// survivor names none, the survivor names that one now, so a link the copy alone carried stays
/// whichever of them stays. Counted as carried.
fn kin_taken(
    table: &str,
    columns: &[String],
    at: Option<usize>,
    live: &mut BTreeMap<String, Record>,
    survivor: &str,
    copy: &str,
    plan: &mut Plan,
) {
    let Some(at) = at else {
        return;
    };
    let named = kin_of(&live[copy], Some(at));
    let Some(record) = live.get_mut(survivor) else {
        return;
    };

    let turso::Value::Text(link) = &named else {
        return;
    };

    if !matches!(record.fields[at], turso::Value::Null) {
        return;
    }

    plan.statements.push((
        format!(
            "UPDATE \"{table}\" SET \"{}\" = ? WHERE \"id\" = ?",
            columns[at]
        ),
        vec![named.clone(), text(survivor)],
    ));
    plan.healed.carried += 1;
    record.kin = Some(link.clone());
    record.fields[at] = named;
}

/// Every record of `records` as [`kin_normalized`] reads it.
fn kin_renormalized(
    records: &mut BTreeMap<String, Record>,
    at: Option<usize>,
    targets: &BTreeMap<String, String>,
) {
    if at.is_none() {
        return;
    }

    for record in records.values_mut() {
        kin_normalized(&mut record.fields, at, targets);
    }
}

/// The record a retired one finally went into: through every record retired into another on the
/// way, to a live one. `None` where the chain ends at a record the workspace no longer holds, or
/// runs round, which shows it again.
fn final_target(
    id: &str,
    retired: &BTreeMap<String, Record>,
    live: &BTreeMap<String, Record>,
) -> Option<String> {
    let mut at = retired.get(id)?.merged_into.clone()?;
    let mut seen = HashSet::new();

    loop {
        if live.contains_key(&at) {
            return Some(at);
        }

        if !seen.insert(at.clone()) {
            return None;
        }

        at = retired.get(&at)?.merged_into.clone()?;
    }
}

/// Move the history of every retired record of `table` to the record it went into, which a
/// record's account reads by its id.
async fn history_moved(
    connection: &turso::Connection,
    table: &str,
    targets: &BTreeMap<String, String>,
    plan: &mut Plan,
) -> Result<(), Error> {
    if targets.is_empty() {
        return Ok(());
    }

    let mut params = vec![table.to_string()];

    params.extend(targets.keys().cloned());

    let found = pairs(
        connection,
        &format!(
            "SELECT \"id\", \"record_id\" FROM \"history\" WHERE \"concept\" = ? \
             AND \"record_id\" IN ({}) ORDER BY \"id\"",
            marks(targets.len())
        ),
        &params,
    )
    .await?;

    for (id, pointing) in found {
        plan.statements.push((
            "UPDATE \"history\" SET \"record_id\" = ? WHERE \"id\" = ?".to_string(),
            vec![text(&targets[&pointing]), text(&id)],
        ));
        plan.healed.moved += 1;
    }

    Ok(())
}

/// Move every link between a contract and a unit naming a retired one to the one it went into, a
/// link that would then hold what another already holds going instead. A link the pass does not
/// move is left as it is.
///
/// **A link is named by what it links**, never by its place in the table: the table has no key of
/// its own, and a row's place is not the same on two machines, so a write naming it would reach
/// another row where another machine replays it. Two rows linking the same pair are one link.
async fn links_moved(
    connection: &turso::Connection,
    survivors: &HashMap<&'static str, BTreeMap<String, String>>,
    plan: &mut Plan,
) -> Result<(), Error> {
    let contracts = survivors.get("contract").cloned().unwrap_or_default();
    let units = survivors.get("unit").cloned().unwrap_or_default();

    if contracts.is_empty() && units.is_empty() {
        return Ok(());
    }

    let links = pairs(
        connection,
        "SELECT DISTINCT \"contract_id\", \"unit_id\" FROM \"contract_unit\" \
         ORDER BY \"contract_id\", \"unit_id\"",
        &[],
    )
    .await?;
    let moved = |contract: &String, unit: &String| {
        (
            contracts.get(contract).cloned().unwrap_or(contract.clone()),
            units.get(unit).cloned().unwrap_or(unit.clone()),
        )
    };
    let mut held: HashSet<(String, String)> = links
        .iter()
        .filter(|(contract, unit)| moved(contract, unit) == (contract.clone(), unit.clone()))
        .cloned()
        .collect();

    for (contract, unit) in links {
        let to = moved(&contract, &unit);

        if to == (contract.clone(), unit.clone()) {
            continue;
        }

        plan.healed.moved += 1;

        if held.contains(&to) {
            plan.statements.push((
                "DELETE FROM \"contract_unit\" WHERE \"contract_id\" = ? AND \"unit_id\" = ?"
                    .to_string(),
                vec![text(&contract), text(&unit)],
            ));
        } else {
            plan.statements.push((
                "UPDATE \"contract_unit\" SET \"contract_id\" = ?, \"unit_id\" = ? \
                 WHERE \"contract_id\" = ? AND \"unit_id\" = ?"
                    .to_string(),
                vec![text(&to.0), text(&to.1), text(&contract), text(&unit)],
            ));
            held.insert(to);
        }
    }

    Ok(())
}

/// Move every record of `table` naming a retired record of its own kind in `column`, as a contract
/// names the contract it renews, to the record that one finally went into: a retired record as
/// well as a live one, so a copy shown again names what is shown. Each is named by its id, in its
/// order, so another machine replaying the writes ends where its own pass would.
fn kin_moved<'a>(
    table: &str,
    column: &str,
    records: impl Iterator<Item = &'a Record>,
    targets: &BTreeMap<String, String>,
    plan: &mut Plan,
) {
    let mut moving: Vec<(&str, &str)> = records
        .filter_map(|record| {
            let target = targets.get(record.kin.as_deref()?)?;

            Some((record.id.as_str(), target.as_str()))
        })
        .collect();

    moving.sort_unstable();

    for (id, target) in moving {
        plan.statements.push((
            format!("UPDATE \"{table}\" SET \"{column}\" = ? WHERE \"id\" = ?"),
            vec![text(target), text(id)],
        ));
        plan.healed.moved += 1;
    }
}

/// `count` question marks, comma separated.
fn marks(count: usize) -> String {
    vec!["?"; count].join(", ")
}

/// The two text columns of every row `sql` answers, given `params`.
async fn pairs(
    connection: &turso::Connection,
    sql: &str,
    params: &[String],
) -> Result<Vec<(String, String)>, Error> {
    let params: Vec<turso::Value> = params.iter().cloned().map(turso::Value::Text).collect();
    let mut rows = connection.query(sql, params).await?;
    let mut found = Vec::new();

    while let Some(row) = rows.next().await? {
        if let (turso::Value::Text(one), turso::Value::Text(other)) =
            (row.get_value(0)?, row.get_value(1)?)
        {
            found.push((one, other));
        }
    }

    Ok(found)
}

/// The units each contract holds, by its id, each as the unit it finally went into, in order.
async fn units_of(
    connection: &turso::Connection,
    units: Option<&BTreeMap<String, String>>,
) -> Result<HashMap<String, Vec<String>>, Error> {
    let mut held: HashMap<String, Vec<String>> = HashMap::new();

    for (contract, unit) in pairs(
        connection,
        "SELECT \"contract_id\", \"unit_id\" FROM \"contract_unit\"",
        &[],
    )
    .await?
    {
        let unit = units
            .and_then(|units| units.get(&unit).cloned())
            .unwrap_or(unit);

        held.entry(contract).or_default().push(unit);
    }

    for units in held.values_mut() {
        units.sort();
        units.dedup();
    }

    Ok(held)
}

/// Every field of `table` a person entered: its columns but those that are none and those the
/// application derives, in its order.
async fn fields_of(
    connection: &turso::Connection,
    table: &str,
    derived: &[&str],
) -> Result<Vec<String>, Error> {
    let mut rows = connection
        .query(format!("PRAGMA table_info(\"{table}\")"), ())
        .await?;
    let mut columns = Vec::new();

    while let Some(row) = rows.next().await? {
        if let turso::Value::Text(name) = row.get_value(1)?
            && !NOT_ENTERED.contains(&name.as_str())
            && !derived.contains(&name.as_str())
        {
            columns.push(name);
        }
    }

    Ok(columns)
}

/// Every record of `table`, in the order of its id, its parent as it names it.
async fn records_of(
    connection: &turso::Connection,
    table: &str,
    columns: &[String],
) -> Result<Vec<Record>, Error> {
    let selected: Vec<String> = columns
        .iter()
        .map(|column| format!("\"{column}\""))
        .collect();
    let mut rows = connection
        .query(
            format!(
                "SELECT \"id\", \"merged_into\", \"merged_as\", {} FROM \"{table}\" ORDER BY \"id\"",
                selected.join(", ")
            ),
            (),
        )
        .await?;
    let mut records = Vec::new();
    let text = |value: turso::Value| match value {
        turso::Value::Text(text) => Some(text),
        _ => None,
    };

    while let Some(row) = rows.next().await? {
        let Some(id) = text(row.get_value(0)?) else {
            continue;
        };
        let mut fields = Vec::with_capacity(columns.len());

        for at in 0..columns.len() {
            fields.push(row.get_value(3 + at)?);
        }

        records.push(Record {
            id,
            merged_into: text(row.get_value(1)?),
            merged_as: text(row.get_value(2)?),
            fields,
            parent: None,
            kin: None,
        });
    }

    Ok(records)
}

/// `fields` as `merged_as` holds them: one object, each column to its value.
fn snapshot(columns: &[String], fields: &[turso::Value]) -> String {
    let object: Map<String, Json> = columns
        .iter()
        .zip(fields)
        .map(|(column, value)| (column.clone(), json_of(value)))
        .collect();

    Json::Object(object).to_string()
}

/// The fields `merged_as` holds, in the order of `columns`; `None` where it is not such an object.
/// A column it does not name, one added after the merge, reads as empty.
fn fields_from(merged_as: &str, columns: &[String]) -> Option<Vec<turso::Value>> {
    let Json::Object(object) = serde_json::from_str::<Json>(merged_as).ok()? else {
        return None;
    };

    Some(
        columns
            .iter()
            .map(|column| {
                object
                    .get(column)
                    .map(value_of)
                    .unwrap_or(turso::Value::Null)
            })
            .collect(),
    )
}

fn json_of(value: &turso::Value) -> Json {
    match value {
        turso::Value::Null => Json::Null,
        turso::Value::Integer(integer) => Json::from(*integer),
        turso::Value::Real(real) => serde_json::Number::from_f64(*real)
            .map(Json::Number)
            .unwrap_or(Json::Null),
        turso::Value::Text(text) => Json::String(text.clone()),
        turso::Value::Blob(bytes) => {
            Json::Array(bytes.iter().map(|byte| Json::from(*byte)).collect())
        }
    }
}

fn value_of(json: &Json) -> turso::Value {
    match json {
        Json::Null => turso::Value::Null,
        Json::Number(number) => match number.as_i64() {
            Some(integer) => turso::Value::Integer(integer),
            None => turso::Value::Real(number.as_f64().unwrap_or_default()),
        },
        Json::String(text) => turso::Value::Text(text.clone()),
        Json::Array(bytes) => turso::Value::Blob(
            bytes
                .iter()
                .filter_map(|byte| byte.as_u64().map(|byte| byte as u8))
                .collect(),
        ),
        Json::Bool(flag) => turso::Value::Integer(i64::from(*flag)),
        Json::Object(_) => turso::Value::Null,
    }
}

/// Write `statements` in one transaction, or none of them.
async fn written(connection: &turso::Connection, statements: Vec<Statement>) -> Result<(), Error> {
    connection.execute("BEGIN IMMEDIATE", ()).await?;

    for (sql, params) in statements {
        if let Err(error) = connection.execute(&sql, params).await {
            let _ = connection.execute("ROLLBACK", ()).await;

            return Err(error.into());
        }
    }

    if let Err(error) = connection.execute("COMMIT", ()).await {
        let _ = connection.execute("ROLLBACK", ()).await;

        return Err(error.into());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{Healed, pass, planned, written};
    use crate::database::test::workspace::{migration_statements, shipped_migration_count};

    // ids that sort in the order the records were made, as UUIDv7 ones do.
    const T0: &str = "01800000-0000-7000-8000-000000000000";
    const T1: &str = "01900000-0000-7000-8000-000000000001";
    const T2: &str = "01900000-0000-7000-8000-000000000002";
    const K1: &str = "01900000-0000-7000-8000-0000000000a1";
    const K2: &str = "01900000-0000-7000-8000-0000000000a2";
    const C1: &str = "01900000-0000-7000-8000-0000000000c1";
    const C2: &str = "01900000-0000-7000-8000-0000000000c2";
    const C3: &str = "01900000-0000-7000-8000-0000000000c3";
    const U1: &str = "01900000-0000-7000-8000-0000000000e1";

    /// A workspace at the shipped version, on a plain database of its own.
    async fn workspace() -> turso::Connection {
        let connection = turso::Builder::new_local(":memory:")
            .build()
            .await
            .expect("an in-memory database")
            .connect()
            .expect("a connection");

        for statement in migration_statements(shipped_migration_count()) {
            run(&connection, &statement).await;
        }

        connection
    }

    async fn run(connection: &turso::Connection, sql: &str) {
        connection
            .execute(sql, ())
            .await
            .unwrap_or_else(|error| panic!("{sql}: {error}"));
    }

    async fn rows(connection: &turso::Connection, sql: &str) -> Vec<Vec<turso::Value>> {
        let mut rows = connection
            .query(sql, ())
            .await
            .unwrap_or_else(|error| panic!("{sql}: {error}"));
        let mut read = Vec::new();

        while let Some(row) = rows.next().await.expect("a row") {
            read.push(
                (0..row.column_count())
                    .map(|at| row.get_value(at).expect("a value"))
                    .collect(),
            );
        }

        read
    }

    fn text(value: &str) -> turso::Value {
        turso::Value::Text(value.to_string())
    }

    async fn tenant(connection: &turso::Connection, id: &str, name: &str, phone: &str) {
        run(
            connection,
            &format!(
                "INSERT INTO tenant (id, national_id, name, phone) \
                 VALUES ('{id}', '1012345678', '{name}', '{phone}')"
            ),
        )
        .await;
    }

    async fn complex(connection: &turso::Connection, id: &str, location: &str) {
        run(
            connection,
            &format!(
                "INSERT INTO complex (id, name, location) VALUES ('{id}', 'Palm Court', '{location}')"
            ),
        )
        .await;
    }

    async fn contract(connection: &turso::Connection, id: &str, gov_id: &str, tenant_id: &str) {
        run(
            connection,
            &format!(
                "INSERT INTO contract (id, gov_id, status, start_date, end_date, \
                 interval_in_months, cost_per_interval, paid_amount, expected_amount, tenant_id) \
                 VALUES ('{id}', '{gov_id}', 'active', 1750000000000, 1780000000000, '12m', \
                 12000.0, 0, 0, '{tenant_id}')"
            ),
        )
        .await;
    }

    async fn payment(connection: &turso::Connection, id: &str, contract_id: &str) {
        run(
            connection,
            &format!(
                "INSERT INTO payment (id, date, amount, contract_id) \
                 VALUES ('{id}', 1750000000000, 500.0, '{contract_id}')"
            ),
        )
        .await;
    }

    async fn history(connection: &turso::Connection, id: &str, concept: &str, record: &str) {
        run(
            connection,
            &format!(
                "INSERT INTO history (id, at, concept, record_id, action, record) \
                 VALUES ('{id}', 1750000000000, '{concept}', '{record}', 'created', 'x')"
            ),
        )
        .await;
    }

    /// Everything a workspace holds, every table in the order of its rows, for two machines to be
    /// compared by.
    async fn everything(connection: &turso::Connection) -> Vec<Vec<Vec<turso::Value>>> {
        let mut held = Vec::new();

        for table in [
            "complex",
            "contract",
            "contract_unit",
            "history",
            "payment",
            "tenant",
            "unit",
        ] {
            held.push(rows(connection, &format!("SELECT * FROM {table} ORDER BY 1, 2")).await);
        }

        held
    }

    /// Two machines saved the same tenant while apart, each with a contract of its own, a payment
    /// and the history its creation wrote.
    async fn two_copies_of_one_tenant() -> turso::Connection {
        let connection = workspace().await;

        tenant(&connection, T1, "Sara", "+966551234567").await;
        tenant(&connection, T2, "Sara", "+966551234567").await;
        contract(&connection, C1, "GOV-1", T1).await;
        contract(&connection, C2, "GOV-2", T2).await;
        payment(&connection, "p2", C2).await;
        history(&connection, "h1", "tenant", T1).await;
        history(&connection, "h2", "tenant", T2).await;

        connection
    }

    /// **Ticket 35's second criterion.** Two tenants the same in every field a person entered heal
    /// into the earlier: the later is retired, never deleted, naming it, and what pointed at the
    /// later, a contract and the history, points at the earlier. A second pass writes nothing.
    #[tokio::test]
    async fn identical_tenants_heal_into_the_earlier_and_what_pointed_at_the_later_moves() {
        let connection = two_copies_of_one_tenant().await;

        let healed = pass(&connection).await.expect("the pass");

        assert_eq!(healed.retired, 1);
        assert!(healed.changed());
        assert_eq!(
            rows(
                &connection,
                "SELECT id, merged_into FROM tenant ORDER BY id"
            )
            .await,
            vec![vec![text(T1), turso::Value::Null], vec![text(T2), text(T1)],],
            "the later is retired into the earlier, and kept"
        );
        assert_eq!(
            rows(
                &connection,
                &format!("SELECT merged_as FROM tenant WHERE id = '{T2}'")
            )
            .await,
            vec![vec![text(
                "{\"name\":\"Sara\",\"national_id\":\"1012345678\",\"phone\":\"+966551234567\"}"
            )]]
        );
        assert_eq!(
            rows(
                &connection,
                "SELECT id, tenant_id FROM contract ORDER BY id"
            )
            .await,
            vec![vec![text(C1), text(T1)], vec![text(C2), text(T1)]],
            "both contracts are on the tenant that stayed"
        );
        assert_eq!(
            rows(&connection, "SELECT contract_id FROM payment").await,
            vec![vec![text(C2)]],
            "a payment stays on its own contract"
        );
        assert_eq!(
            rows(&connection, "SELECT id, record_id FROM history ORDER BY id").await,
            vec![vec![text("h1"), text(T1)], vec![text("h2"), text(T1)]]
        );

        let before = everything(&connection).await;

        assert_eq!(pass(&connection).await.expect("again"), Healed::default());
        assert_eq!(everything(&connection).await, before, "a second pass wrote");
    }

    async fn unit(connection: &turso::Connection, id: &str, name: &str, complex: &str) {
        run(
            connection,
            &format!(
                "INSERT INTO unit (id, name, status, complex_id) \
                 VALUES ('{id}', '{name}', 'vacant', '{complex}')"
            ),
        )
        .await;
    }

    async fn paid(connection: &turso::Connection, id: &str, contract_id: &str, amount: f64) {
        run(
            connection,
            &format!(
                "INSERT INTO payment (id, date, amount, contract_id) \
                 VALUES ('{id}', 1750000000000, {amount:?}, '{contract_id}')"
            ),
        )
        .await;
    }

    /// The payments shown on `contract`, and what they come to: what a reconcile reads.
    async fn shown_payments(connection: &turso::Connection, contract: &str) -> (Vec<String>, f64) {
        let rows = rows(
            connection,
            &format!(
                "SELECT id, amount FROM payment WHERE contract_id = '{contract}' \
                 AND merged_into IS NULL ORDER BY id"
            ),
        )
        .await;
        let ids = rows
            .iter()
            .map(|row| match &row[0] {
                turso::Value::Text(id) => id.clone(),
                other => panic!("{other:?}"),
            })
            .collect();
        let total = rows
            .iter()
            .map(|row| match row[1] {
                turso::Value::Real(amount) => amount,
                turso::Value::Integer(amount) => amount as f64,
                ref other => panic!("{other:?}"),
            })
            .sum();

        (ids, total)
    }

    /// **The coordinator's first test.** Two machines saved one complex with the same units while
    /// apart: one complex is shown, with one set of units, the later complex's units retired into
    /// the earlier's one to one, and a contract on a retired unit holds the one that stayed.
    #[tokio::test]
    async fn identical_complexes_with_the_same_units_end_with_one_set_of_units() {
        let connection = workspace().await;

        complex(&connection, K1, "Riyadh").await;
        complex(&connection, K2, "Riyadh").await;
        unit(&connection, "u-1-a1", "A1", K1).await;
        unit(&connection, "u-1-a2", "A2", K1).await;
        unit(&connection, "u-2-a1", "A1", K2).await;
        unit(&connection, "u-2-a2", "A2", K2).await;
        tenant(&connection, T1, "Sara", "+966551234567").await;
        contract(&connection, C1, "GOV-1", T1).await;
        run(
            &connection,
            &format!("INSERT INTO contract_unit (contract_id, unit_id) VALUES ('{C1}', 'u-2-a1')"),
        )
        .await;
        history(&connection, "h-u", "unit", "u-2-a2").await;

        let healed = pass(&connection).await.expect("the pass");

        assert_eq!(healed.retired, 3, "a complex and its two units");
        assert_eq!(
            rows(
                &connection,
                "SELECT id FROM complex WHERE merged_into IS NULL"
            )
            .await,
            vec![vec![text(K1)]]
        );
        assert_eq!(
            rows(
                &connection,
                "SELECT id, complex_id, merged_into FROM unit ORDER BY id"
            )
            .await,
            vec![
                vec![text("u-1-a1"), text(K1), turso::Value::Null],
                vec![text("u-1-a2"), text(K1), turso::Value::Null],
                vec![text("u-2-a1"), text(K2), text("u-1-a1")],
                vec![text("u-2-a2"), text(K2), text("u-1-a2")],
            ],
            "one set of units shown, the copies kept and retired into it"
        );
        assert_eq!(
            rows(
                &connection,
                "SELECT contract_id, unit_id FROM contract_unit"
            )
            .await,
            vec![vec![text(C1), text("u-1-a1")]]
        );
        assert_eq!(
            rows(
                &connection,
                "SELECT record_id FROM history WHERE id = 'h-u'"
            )
            .await,
            vec![vec![text("u-1-a2")]]
        );
        assert_eq!(pass(&connection).await.expect("again"), Healed::default());
    }

    /// **The coordinator's second test.** Two machines saved one contract with the same payment
    /// while apart: one contract is shown, holding that payment once, so what it was paid is what
    /// it was; the other payment is kept, retired into it, and a unit both held is held once.
    #[tokio::test]
    async fn identical_contracts_with_the_same_payment_keep_it_once_and_the_paid_amount() {
        let connection = workspace().await;

        tenant(&connection, T1, "Sara", "+966551234567").await;
        contract(&connection, C1, "GOV-1", T1).await;
        contract(&connection, C2, "GOV-1", T1).await;
        paid(&connection, "p-1", C1, 500.0).await;
        paid(&connection, "p-2", C2, 500.0).await;

        for id in [C1, C2] {
            run(
                &connection,
                &format!(
                    "INSERT INTO contract_unit (contract_id, unit_id) VALUES ('{id}', '{U1}')"
                ),
            )
            .await;
            history(&connection, &format!("h-{id}"), "contract", id).await;
        }

        let before = shown_payments(&connection, C1).await.1;
        let healed = pass(&connection).await.expect("the pass");

        assert_eq!(healed.retired, 2, "a contract and its payment");
        assert_eq!(
            rows(
                &connection,
                "SELECT id, merged_into FROM contract ORDER BY id"
            )
            .await,
            vec![vec![text(C1), turso::Value::Null], vec![text(C2), text(C1)]]
        );
        assert_eq!(
            shown_payments(&connection, C1).await,
            (vec!["p-1".to_string()], before),
            "the payment is shown once, and the paid amount is what it was"
        );
        assert_eq!(
            rows(
                &connection,
                "SELECT merged_into FROM payment WHERE id = 'p-2'"
            )
            .await,
            vec![vec![text("p-1")]]
        );
        assert_eq!(
            rows(
                &connection,
                "SELECT contract_id, unit_id FROM contract_unit"
            )
            .await,
            vec![vec![text(C1), text(U1)]]
        );
        assert_eq!(
            rows(&connection, "SELECT record_id FROM history ORDER BY id").await,
            vec![vec![text(C1)], vec![text(C1)]]
        );
        assert_eq!(pass(&connection).await.expect("again"), Healed::default());
    }

    /// **The coordinator's third test.** A payment only one copy holds moves to the contract that
    /// stayed and is counted once, beside the one both held, which is counted once too.
    #[tokio::test]
    async fn a_payment_on_only_one_copy_moves_and_is_counted_once() {
        let connection = workspace().await;

        tenant(&connection, T1, "Sara", "+966551234567").await;
        contract(&connection, C1, "GOV-1", T1).await;
        contract(&connection, C2, "GOV-1", T1).await;
        paid(&connection, "p-1", C1, 500.0).await;
        paid(&connection, "p-2", C2, 500.0).await;
        paid(&connection, "p-3", C2, 250.0).await;

        let healed = pass(&connection).await.expect("the pass");

        assert_eq!(healed.retired, 2);
        assert_eq!(
            shown_payments(&connection, C1).await,
            (vec!["p-1".to_string(), "p-3".to_string()], 750.0)
        );
        assert_eq!(pass(&connection).await.expect("again"), Healed::default());
    }

    /// A machine that saved the same payment twice on purpose keeps both: a copy pairs one to one,
    /// so the survivor's second payment has no partner and the copy's second moves.
    #[tokio::test]
    async fn children_pair_one_to_one_and_never_more() {
        let connection = workspace().await;

        tenant(&connection, T1, "Sara", "+966551234567").await;
        contract(&connection, C1, "GOV-1", T1).await;
        contract(&connection, C2, "GOV-1", T1).await;
        paid(&connection, "p-1", C1, 500.0).await;
        paid(&connection, "p-2", C2, 500.0).await;
        paid(&connection, "p-3", C2, 500.0).await;

        pass(&connection).await.expect("the pass");

        assert_eq!(
            shown_payments(&connection, C1).await,
            (vec!["p-1".to_string(), "p-3".to_string()], 1000.0)
        );
    }

    /// **The coordinator's fourth test.** Two machines holding the same copies, with their units
    /// and payments laid down in another order, heal them alike.
    #[tokio::test]
    async fn two_machines_healing_complexes_contracts_and_payments_agree() {
        async fn laid(order: bool) -> turso::Connection {
            let connection = workspace().await;
            let complexes = if order { [K1, K2] } else { [K2, K1] };
            let contracts = if order { [C1, C2] } else { [C2, C1] };

            for id in complexes {
                complex(&connection, id, "Riyadh").await;
                unit(&connection, &format!("u-{id}"), "A1", id).await;
            }

            tenant(&connection, T1, "Sara", "+966551234567").await;

            for id in contracts {
                contract(&connection, id, "GOV-1", T1).await;
                paid(&connection, &format!("p-{id}"), id, 500.0).await;
            }

            connection
        }

        let one = laid(true).await;
        let other = laid(false).await;

        assert_eq!(
            pass(&one).await.expect("one"),
            pass(&other).await.expect("the other")
        );
        assert_eq!(everything(&one).await, everything(&other).await);
        assert_eq!(pass(&one).await.expect("again"), Healed::default());
        assert_eq!(pass(&other).await.expect("again"), Healed::default());
    }

    /// **Ticket 35's fourth criterion.** Two records sharing the value the app keeps unique and
    /// differing in any other field a person entered are both kept as they are, a tenant, a
    /// complex and a contract each, and nothing is written. Two contracts holding no government ID
    /// share nothing, and two holding different units differ.
    #[tokio::test]
    async fn records_sharing_a_value_and_differing_are_left_untouched() {
        let connection = workspace().await;

        tenant(&connection, T1, "Sara", "+966551234567").await;
        tenant(&connection, T2, "Sara Al-Harbi", "+966551234567").await;
        complex(&connection, K1, "Riyadh").await;
        complex(&connection, K2, "Jeddah").await;
        contract(&connection, C1, "GOV-1", T1).await;
        contract(&connection, C2, "GOV-1", T1).await;
        run(
            &connection,
            &format!("UPDATE contract SET cost_per_interval = 13000.0 WHERE id = '{C2}'"),
        )
        .await;
        contract(&connection, "c-none-1", "x", T1).await;
        contract(&connection, "c-none-2", "x", T1).await;
        run(
            &connection,
            "UPDATE contract SET gov_id = NULL WHERE id LIKE 'c-none-%'",
        )
        .await;
        contract(&connection, "c-unit-1", "GOV-U", T1).await;
        contract(&connection, "c-unit-2", "GOV-U", T1).await;
        run(
            &connection,
            &format!(
                "INSERT INTO contract_unit (contract_id, unit_id) VALUES ('c-unit-1', '{U1}')"
            ),
        )
        .await;

        let before = everything(&connection).await;

        assert_eq!(
            pass(&connection).await.expect("the pass"),
            Healed::default()
        );
        assert_eq!(everything(&connection).await, before);
    }

    /// **Ticket 35's second criterion: the same on two machines.** Two machines that pulled the
    /// same rows, laid down in a different order, heal them into the same survivor with the same
    /// writes, so either order of their pushes leaves one survivor and nothing lost; and a pass
    /// over a workspace either healed writes nothing more.
    #[tokio::test]
    async fn two_machines_healing_the_same_pair_agree() {
        let one = two_copies_of_one_tenant().await;
        let other = workspace().await;

        tenant(&other, T2, "Sara", "+966551234567").await;
        tenant(&other, T1, "Sara", "+966551234567").await;
        contract(&other, C2, "GOV-2", T2).await;
        contract(&other, C1, "GOV-1", T1).await;
        payment(&other, "p2", C2).await;
        history(&other, "h2", "tenant", T2).await;
        history(&other, "h1", "tenant", T1).await;

        let healed_one = pass(&one).await.expect("one");
        let healed_other = pass(&other).await.expect("the other");

        assert_eq!(healed_one, healed_other);
        assert_eq!(everything(&one).await, everything(&other).await);
        assert_eq!(pass(&one).await.expect("again"), Healed::default());
        assert_eq!(pass(&other).await.expect("again"), Healed::default());
    }

    /// **Ticket 35's third criterion, a reference.** A contract a machine that had not heard of the
    /// merge made on the retired tenant moves to the one that stayed on the next pass, and so does
    /// the history it wrote.
    #[tokio::test]
    async fn a_reference_made_later_to_a_retired_record_moves_to_its_survivor() {
        let connection = two_copies_of_one_tenant().await;

        pass(&connection).await.expect("the pass");
        contract(&connection, C3, "GOV-3", T2).await;
        history(&connection, "h3", "tenant", T2).await;

        let healed = pass(&connection).await.expect("again");

        assert_eq!(healed.moved, 2);
        assert_eq!(
            rows(
                &connection,
                &format!("SELECT tenant_id FROM contract WHERE id = '{C3}'")
            )
            .await,
            vec![vec![text(T1)]]
        );
        assert_eq!(
            rows(&connection, "SELECT record_id FROM history WHERE id = 'h3'").await,
            vec![vec![text(T1)]]
        );
    }

    /// **Ticket 35's third criterion, a field.** A field changed on a retired record after its
    /// merge reaches the record that stayed where that record has not changed it since; a field
    /// both changed keeps the survivor's, and a change the survivor makes later is never undone by
    /// the copy.
    #[tokio::test]
    async fn a_change_to_a_retired_record_reaches_the_survivor_where_it_has_not_changed() {
        let connection = two_copies_of_one_tenant().await;

        pass(&connection).await.expect("the pass");

        // a machine that had not heard of the merge renames its copy and changes its phone, which
        // the survivor changed too meanwhile.
        run(
            &connection,
            &format!(
                "UPDATE tenant SET name = 'Sara Al-Harbi', phone = '+966550000001' WHERE id = '{T2}'"
            ),
        )
        .await;
        run(
            &connection,
            &format!("UPDATE tenant SET phone = '+966550000002' WHERE id = '{T1}'"),
        )
        .await;

        let healed = pass(&connection).await.expect("again");

        assert_eq!(healed.carried, 1);
        assert_eq!(
            rows(
                &connection,
                &format!("SELECT name, phone FROM tenant WHERE id = '{T1}'")
            )
            .await,
            vec![vec![text("Sara Al-Harbi"), text("+966550000002")]],
            "the name is carried, and the phone both changed stays the survivor's"
        );

        // the survivor is renamed later: the copy, which did not change, takes nothing back.
        run(
            &connection,
            &format!("UPDATE tenant SET name = 'Sara H.' WHERE id = '{T1}'"),
        )
        .await;
        pass(&connection).await.expect("a third");
        assert_eq!(
            rows(
                &connection,
                &format!("SELECT name FROM tenant WHERE id = '{T1}'")
            )
            .await,
            vec![vec![text("Sara H.")]]
        );
        assert_eq!(
            pass(&connection).await.expect("a fourth"),
            Healed::default()
        );
    }

    /// A record that turns out to be a copy of an earlier one after records were retired into it,
    /// a machine whose clock ran behind having made the earlier, takes them along: every record
    /// retired into it goes on to the one that stayed.
    #[tokio::test]
    async fn a_record_retired_after_others_were_retired_into_it_takes_them_along() {
        let connection = two_copies_of_one_tenant().await;

        pass(&connection).await.expect("the pass");
        tenant(&connection, T0, "Sara", "+966551234567").await;
        pass(&connection).await.expect("again");

        assert_eq!(
            rows(
                &connection,
                "SELECT id, merged_into FROM tenant ORDER BY id"
            )
            .await,
            vec![
                vec![text(T0), turso::Value::Null],
                vec![text(T1), text(T0)],
                vec![text(T2), text(T0)],
            ]
        );
        assert_eq!(
            rows(&connection, "SELECT DISTINCT tenant_id FROM contract").await,
            vec![vec![text(T0)]]
        );
        assert_eq!(pass(&connection).await.expect("a third"), Healed::default());
    }

    /// **Ticket 39, the review's case.** One machine saved a tenant with a contract and its whole
    /// payment, so the contract reconciled to `fulfilled` and took the amounts; the other saved
    /// the same tenant and contract with no payment, so its copy stayed `active`. What a contract
    /// shows of its standing is the application's, not anybody's entry: the copies pair, and the
    /// payment counts once.
    #[tokio::test]
    async fn copies_of_a_contract_differing_only_in_what_the_app_derives_pair() {
        let connection = workspace().await;

        for (tenant_id, contract_id) in [(T1, C1), (T2, C2)] {
            tenant(&connection, tenant_id, "Sara", "+966551234567").await;
            contract(&connection, contract_id, "GOV-1", tenant_id).await;
            run(
                &connection,
                &format!(
                    "INSERT INTO contract_unit (contract_id, unit_id) VALUES ('{contract_id}', '{U1}')"
                ),
            )
            .await;
        }

        paid(&connection, "p-1", C1, 12000.0).await;
        run(
            &connection,
            &format!(
                "UPDATE contract SET status = 'fulfilled', paid_amount = 12000.0, \
                 expected_amount = 12000.0 WHERE id = '{C1}'"
            ),
        )
        .await;

        pass(&connection).await.expect("the pass");

        assert_eq!(
            rows(
                &connection,
                "SELECT id, merged_into FROM contract ORDER BY id"
            )
            .await,
            vec![vec![text(C1), turso::Value::Null], vec![text(C2), text(C1)]],
            "the copies did not pair"
        );
        assert_eq!(
            shown_payments(&connection, C1).await,
            (vec!["p-1".to_string()], 12000.0)
        );
        assert_eq!(pass(&connection).await.expect("again"), Healed::default());
    }

    /// **Ticket 39.** A reconcile of a retired copy, on a build that does not know it was retired,
    /// moves its status and its amounts. None of that was entered by anybody, so none of it is
    /// carried to the contract that stayed, and the copy is written nothing either.
    #[tokio::test]
    async fn what_a_reconcile_writes_to_a_retired_copy_is_not_carried() {
        let connection = workspace().await;

        tenant(&connection, T1, "Sara", "+966551234567").await;
        contract(&connection, C1, "GOV-1", T1).await;
        contract(&connection, C2, "GOV-1", T1).await;
        pass(&connection).await.expect("the pass");
        run(
            &connection,
            &format!(
                "UPDATE contract SET status = 'defaulted', paid_amount = 99.0, \
                 expected_amount = 99.0 WHERE id = '{C2}'"
            ),
        )
        .await;

        assert_eq!(pass(&connection).await.expect("again"), Healed::default());
        assert_eq!(
            rows(
                &connection,
                &format!("SELECT status, paid_amount FROM contract WHERE id = '{C1}'")
            )
            .await,
            vec![vec![text("active"), turso::Value::Real(0.0)]]
        );
    }

    /// **Ticket 39.** Terminating is a person's act, though the rest of a contract's status is
    /// derived: a copy terminated and one not are not the same contract, and a copy terminated
    /// after its merge, by a machine that had not heard of it, terminates the one that stayed.
    #[tokio::test]
    async fn a_termination_is_entered_and_is_compared_and_carried() {
        let connection = workspace().await;

        tenant(&connection, T1, "Sara", "+966551234567").await;
        contract(&connection, C1, "GOV-1", T1).await;
        contract(&connection, C2, "GOV-1", T1).await;
        contract(&connection, C3, "GOV-1", T1).await;
        run(
            &connection,
            &format!("UPDATE contract SET status = 'terminated' WHERE id = '{C3}'"),
        )
        .await;

        let healed = pass(&connection).await.expect("the pass");

        assert_eq!(healed.retired, 1, "a terminated copy was retired");
        assert_eq!(
            rows(
                &connection,
                "SELECT id FROM contract WHERE merged_into IS NULL ORDER BY id"
            )
            .await,
            vec![vec![text(C1)], vec![text(C3)]]
        );

        run(
            &connection,
            &format!("UPDATE contract SET status = 'terminated' WHERE id = '{C2}'"),
        )
        .await;

        assert_eq!(pass(&connection).await.expect("again").carried, 1);
        assert_eq!(
            rows(
                &connection,
                &format!("SELECT status FROM contract WHERE id = '{C1}'")
            )
            .await,
            vec![vec![text("terminated")]]
        );
    }

    /// **Ticket 39.** A person on a build that shows both copies deletes the one that stayed,
    /// seeing a duplicate. The copy retired into it is the record now: it is retired into nothing
    /// and is shown again, the same on every later pass.
    #[tokio::test]
    async fn a_copy_whose_survivor_was_deleted_is_shown_again() {
        let connection = two_copies_of_one_tenant().await;

        pass(&connection).await.expect("the pass");
        run(
            &connection,
            &format!("DELETE FROM tenant WHERE id = '{T1}'"),
        )
        .await;
        pass(&connection).await.expect("again");

        assert_eq!(
            rows(&connection, "SELECT id, merged_into, merged_as FROM tenant").await,
            vec![vec![text(T2), turso::Value::Null, turso::Value::Null]]
        );
        assert_eq!(pass(&connection).await.expect("a third"), Healed::default());
    }

    /// **Ticket 39.** The links between contracts and units carry no key of their own, and a row's
    /// place in the table is not the same on two machines. Another machine replaying what one
    /// machine's pass wrote ends where its own pass would have, so the pass names a link by what
    /// it links.
    #[tokio::test]
    async fn what_a_pass_writes_to_the_links_means_the_same_on_another_machine() {
        async fn laid(order: [&str; 2]) -> turso::Connection {
            let connection = workspace().await;

            tenant(&connection, T1, "Sara", "+966551234567").await;

            for id in [C1, C2] {
                contract(&connection, id, "GOV-1", T1).await;
            }

            for id in order {
                run(
                    &connection,
                    &format!(
                        "INSERT INTO contract_unit (contract_id, unit_id) VALUES ('{id}', '{U1}')"
                    ),
                )
                .await;
            }

            connection
        }

        let one = laid([C1, C2]).await;
        let other = laid([C2, C1]).await;
        let replayed = laid([C2, C1]).await;

        written(&replayed, planned(&one).await.expect("the plan").statements)
            .await
            .expect("the replay");
        pass(&one).await.expect("one");
        pass(&other).await.expect("the other");

        assert_eq!(
            rows(&replayed, "SELECT contract_id, unit_id FROM contract_unit").await,
            vec![vec![text(C1), text(U1)]]
        );
        assert_eq!(everything(&replayed).await, everything(&other).await);
    }

    /// `successor` renews `predecessor`, as a renewal writes it.
    async fn renews(connection: &turso::Connection, successor: &str, predecessor: &str) {
        run(
            connection,
            &format!(
                "UPDATE contract SET renews_contract_id = '{predecessor}' WHERE id = '{successor}'"
            ),
        )
        .await;
    }

    /// The contract each contract renews, by its id, retired or not.
    async fn renewals(connection: &turso::Connection) -> Vec<Vec<turso::Value>> {
        rows(
            connection,
            "SELECT id, renews_contract_id, merged_into FROM contract ORDER BY id",
        )
        .await
    }

    /// **Effort 861, ticket 10, the first criterion.** Two machines saved one contract while
    /// apart, and one of them renewed its copy. The copy is retired into the contract that
    /// stayed, and the renewal names that one now, so the survivor keeps its successor; a
    /// renewal a machine that had not heard of the merge made later of the retired copy moves
    /// too. A pass over what it healed writes nothing.
    #[tokio::test]
    async fn a_renewal_of_a_retired_copy_names_the_contract_that_stayed() {
        let connection = workspace().await;

        tenant(&connection, T1, "Sara", "+966551234567").await;
        contract(&connection, C1, "GOV-1", T1).await;
        contract(&connection, C2, "GOV-1", T1).await;
        contract(&connection, C3, "GOV-2", T1).await;
        renews(&connection, C3, C2).await;

        let healed = pass(&connection).await.expect("the pass");

        assert_eq!(healed.retired, 1);
        assert_eq!(healed.moved, 1, "the renewal link is a reference moved");
        assert_eq!(
            renewals(&connection).await,
            vec![
                vec![text(C1), turso::Value::Null, turso::Value::Null],
                vec![text(C2), turso::Value::Null, text(C1)],
                vec![text(C3), text(C1), turso::Value::Null],
            ],
            "the successor names the contract that stayed"
        );
        assert_eq!(pass(&connection).await.expect("again"), Healed::default());

        // a machine that had not heard of the merge renews the copy it still shows.
        let later = "01900000-0000-7000-8000-0000000000c4";

        contract(&connection, later, "GOV-3", T1).await;
        renews(&connection, later, C2).await;

        assert_eq!(pass(&connection).await.expect("a third").moved, 1);
        assert_eq!(
            rows(
                &connection,
                &format!("SELECT renews_contract_id FROM contract WHERE id = '{later}'")
            )
            .await,
            vec![vec![text(C1)]]
        );
        assert_eq!(
            pass(&connection).await.expect("a fourth"),
            Healed::default()
        );
    }

    /// **Effort 861, ticket 10, the second criterion.** Two machines saved one contract and its
    /// renewal while apart, so each renewal names its own machine's copy of what it renews. The
    /// renewals are compared with what they renew as the contract it finally went into, as a
    /// record's parent is, so they pair in the pass that retires the copy they renew: under one
    /// tenant, sharing a government ID, and under two copies of one tenant, holding none, where a
    /// renewal made before what it renews, by a clock that ran behind, pairs all the same. Two
    /// machines laying the same rows down in another order heal them alike, and a pass over what
    /// either healed writes nothing.
    #[tokio::test]
    async fn copies_of_a_renewal_of_copies_pair() {
        // under one tenant: two copies of a contract, and two of its renewal.
        async fn one_tenant(order: bool) -> turso::Connection {
            let connection = workspace().await;
            let pairs = [(C1, "c-renewal-1"), (C2, "c-renewal-2")];
            let laid = if order { pairs } else { [pairs[1], pairs[0]] };

            tenant(&connection, T1, "Sara", "+966551234567").await;

            for (predecessor, successor) in laid {
                contract(&connection, predecessor, "GOV-1", T1).await;
                contract(&connection, successor, "GOV-2", T1).await;
                renews(&connection, successor, predecessor).await;
            }

            connection
        }

        // under two copies of one tenant, holding no government ID, each renewal's id sorting
        // before what it renews.
        async fn two_tenants(order: bool) -> turso::Connection {
            let connection = workspace().await;
            let pairs = [
                (T1, "c-made-1", "c-before-1"),
                (T2, "c-made-2", "c-before-2"),
            ];
            let laid = if order { pairs } else { [pairs[1], pairs[0]] };

            for (tenant_id, predecessor, successor) in laid {
                tenant(&connection, tenant_id, "Sara", "+966551234567").await;
                contract(&connection, predecessor, "x", tenant_id).await;
                contract(&connection, successor, "x", tenant_id).await;
                renews(&connection, successor, predecessor).await;
            }

            run(&connection, "UPDATE contract SET gov_id = NULL").await;

            connection
        }

        let one = one_tenant(true).await;
        let healed = pass(&one).await.expect("one tenant");

        assert_eq!(healed.retired, 2, "the contract and its renewal");
        assert_eq!(
            renewals(&one).await,
            vec![
                vec![text(C1), turso::Value::Null, turso::Value::Null],
                vec![text(C2), turso::Value::Null, text(C1)],
                vec![text("c-renewal-1"), text(C1), turso::Value::Null],
                vec![text("c-renewal-2"), text(C1), text("c-renewal-1")],
            ]
        );
        assert_eq!(pass(&one).await.expect("again"), Healed::default());

        let other = one_tenant(false).await;

        pass(&other).await.expect("one tenant, laid otherwise");
        assert_eq!(everything(&other).await, everything(&one).await);

        let two = two_tenants(true).await;
        let healed = pass(&two).await.expect("two tenants");

        assert_eq!(
            healed.retired, 3,
            "the tenant, the contract and its renewal"
        );
        assert_eq!(
            renewals(&two).await,
            vec![
                vec![text("c-before-1"), text("c-made-1"), turso::Value::Null],
                vec![text("c-before-2"), text("c-made-1"), text("c-before-1")],
                vec![text("c-made-1"), turso::Value::Null, turso::Value::Null],
                vec![text("c-made-2"), turso::Value::Null, text("c-made-1")],
            ]
        );
        assert_eq!(pass(&two).await.expect("again"), Healed::default());

        let other = two_tenants(false).await;

        pass(&other).await.expect("two tenants, laid otherwise");
        assert_eq!(everything(&other).await, everything(&two).await);
    }

    /// Two machines each renewed the same copy of a contract while apart, and the copy is retired
    /// in the pass that pairs the renewals. The renewal retired holds what it was as renewing the
    /// contract that stayed, so a pass over what this one healed writes nothing.
    #[tokio::test]
    async fn renewals_of_one_copy_pair_in_the_pass_that_retires_it() {
        let connection = workspace().await;

        tenant(&connection, T1, "Sara", "+966551234567").await;
        contract(&connection, C1, "GOV-1", T1).await;
        contract(&connection, C2, "GOV-1", T1).await;

        for successor in ["c-renewal-1", "c-renewal-2"] {
            contract(&connection, successor, "GOV-2", T1).await;
            renews(&connection, successor, C2).await;
        }

        assert_eq!(pass(&connection).await.expect("the pass").retired, 2);
        assert_eq!(
            renewals(&connection).await,
            vec![
                vec![text(C1), turso::Value::Null, turso::Value::Null],
                vec![text(C2), turso::Value::Null, text(C1)],
                vec![text("c-renewal-1"), text(C1), turso::Value::Null],
                vec![text("c-renewal-2"), text(C1), text("c-renewal-1")],
            ]
        );
        assert_eq!(
            rows(
                &connection,
                "SELECT json_extract(merged_as, '$.renews_contract_id') FROM contract \
                 WHERE id = 'c-renewal-2'"
            )
            .await,
            vec![vec![text(C1)]]
        );
        assert_eq!(pass(&connection).await.expect("again"), Healed::default());
    }

    /// Contracts the copies renew, made before them.
    const P1: &str = "01800000-0000-7000-8000-0000000000b1";
    const P2: &str = "01800000-0000-7000-8000-0000000000b2";

    /// **Effort 861, ticket 18, the first criterion.** Two machines entered the same next contract
    /// while apart, and one machine's reconcile linked its copy to what it renews before the copies
    /// met; the other's copy names nothing yet, as an older build's renewal does too. The copies
    /// pair whichever of them names it, and the contract that stayed names it: under one tenant,
    /// sharing a government ID, and under two copies of one tenant, holding none. The rows laid
    /// down in either order heal alike, and a pass over what either healed writes nothing.
    #[tokio::test]
    async fn copies_pair_when_one_alone_names_what_it_renews() {
        // under one tenant: the predecessor, and two copies of its successor, `linked` naming it.
        async fn one_tenant(linked: &str, order: [&str; 2]) -> turso::Connection {
            let connection = workspace().await;

            tenant(&connection, T1, "Sara", "+966551234567").await;
            contract(&connection, P1, "GOV-0", T1).await;

            for id in order {
                contract(&connection, id, "GOV-1", T1).await;
            }

            renews(&connection, linked, P1).await;

            connection
        }

        // under two copies of one tenant, each holding one copy of the successor, and no
        // government ID anywhere.
        async fn two_tenants(linked: &str, order: [(&str, &str); 2]) -> turso::Connection {
            let connection = workspace().await;

            tenant(&connection, T1, "Sara", "+966551234567").await;
            contract(&connection, P1, "x", T1).await;

            for (tenant_id, id) in order {
                if tenant_id != T1 {
                    tenant(&connection, tenant_id, "Sara", "+966551234567").await;
                }

                contract(&connection, id, "x", tenant_id).await;
            }

            renews(&connection, linked, P1).await;
            run(&connection, "UPDATE contract SET gov_id = NULL").await;
            // the contract it continues began earlier, so it is no copy of the successor.
            run(
                &connection,
                &format!("UPDATE contract SET start_date = 1720000000000 WHERE id = '{P1}'"),
            )
            .await;

            connection
        }

        for linked in [C1, C2] {
            let mut healed_alike = Vec::new();

            for order in [[C1, C2], [C2, C1]] {
                let connection = one_tenant(linked, order).await;

                let healed = pass(&connection).await.expect("one tenant");

                assert_eq!(healed.retired, 1);
                assert_eq!(
                    healed.carried,
                    usize::from(linked == C2),
                    "the link a retired copy alone named is the survivor's now"
                );
                assert_eq!(
                    rows(
                        &connection,
                        &format!(
                            "SELECT id, renews_contract_id, merged_into FROM contract \
                             WHERE id <> '{P1}' ORDER BY id"
                        )
                    )
                    .await,
                    vec![
                        vec![text(C1), text(P1), turso::Value::Null],
                        vec![
                            text(C2),
                            if linked == C2 {
                                text(P1)
                            } else {
                                turso::Value::Null
                            },
                            text(C1)
                        ],
                    ],
                    "the earlier stays and names what it renews, {linked} naming it"
                );
                assert_eq!(pass(&connection).await.expect("again"), Healed::default());
                healed_alike.push(everything(&connection).await);
            }

            assert_eq!(healed_alike[0], healed_alike[1], "{linked} naming it");

            let mut healed_alike = Vec::new();

            for order in [[(T1, C1), (T2, C2)], [(T2, C2), (T1, C1)]] {
                let connection = two_tenants(linked, order).await;

                assert_eq!(
                    pass(&connection).await.expect("two tenants").retired,
                    2,
                    "the tenant and the successor"
                );
                assert_eq!(
                    rows(
                        &connection,
                        &format!(
                            "SELECT renews_contract_id FROM contract \
                             WHERE merged_into IS NULL AND id <> '{P1}'"
                        )
                    )
                    .await,
                    vec![vec![text(P1)]],
                    "the successor that stayed names what it renews, {linked} naming it"
                );
                assert_eq!(pass(&connection).await.expect("again"), Healed::default());
                healed_alike.push(everything(&connection).await);
            }

            assert_eq!(healed_alike[0], healed_alike[1], "{linked} naming it");
        }
    }

    /// **Effort 861, ticket 18, the second criterion.** Two copies alike in everything else but
    /// naming two contracts they renew are two contracts, under one tenant and under two copies of
    /// one tenant, where the one under the copy moves.
    #[tokio::test]
    async fn copies_naming_two_predecessors_do_not_pair() {
        let connection = workspace().await;

        tenant(&connection, T1, "Sara", "+966551234567").await;
        contract(&connection, P1, "GOV-0", T1).await;
        contract(&connection, P2, "GOV-9", T1).await;
        contract(&connection, C1, "GOV-1", T1).await;
        contract(&connection, C2, "GOV-1", T1).await;
        renews(&connection, C1, P1).await;
        renews(&connection, C2, P2).await;

        assert_eq!(
            pass(&connection).await.expect("one tenant"),
            Healed::default()
        );

        let connection = workspace().await;

        tenant(&connection, T1, "Sara", "+966551234567").await;
        tenant(&connection, T2, "Sara", "+966551234567").await;
        contract(&connection, P1, "GOV-0", T1).await;
        contract(&connection, P2, "GOV-9", T1).await;
        contract(&connection, C1, "x", T1).await;
        contract(&connection, C2, "x", T2).await;
        renews(&connection, C1, P1).await;
        renews(&connection, C2, P2).await;
        run(
            &connection,
            &format!("UPDATE contract SET gov_id = NULL WHERE id IN ('{C1}', '{C2}')"),
        )
        .await;

        let healed = pass(&connection).await.expect("two tenants");

        assert_eq!(healed.retired, 1, "the tenant alone");
        assert_eq!(
            rows(
                &connection,
                &format!(
                    "SELECT id, renews_contract_id, merged_into, tenant_id FROM contract \
                     WHERE id IN ('{C1}', '{C2}') ORDER BY id"
                )
            )
            .await,
            vec![
                vec![text(C1), text(P1), turso::Value::Null, text(T1)],
                vec![text(C2), text(P2), turso::Value::Null, text(T1)],
            ]
        );
        assert_eq!(pass(&connection).await.expect("again"), Healed::default());
    }

    /// A contract alike in all else to the one it renews is no copy of it, though it alone names
    /// one: pairing them would make the contract that stayed renew itself.
    #[tokio::test]
    async fn a_contract_never_pairs_with_the_one_it_renews() {
        let connection = workspace().await;

        tenant(&connection, T1, "Sara", "+966551234567").await;
        contract(&connection, C1, "GOV-1", T1).await;
        contract(&connection, C2, "GOV-1", T1).await;
        renews(&connection, C2, C1).await;

        assert_eq!(
            pass(&connection).await.expect("the pass"),
            Healed::default()
        );
    }

    /// **A pass that fails writes nothing**: its writes are one transaction, and a workspace
    /// missing what the pass reads answers an error rather than half a heal.
    #[tokio::test]
    async fn a_pass_that_fails_leaves_the_workspace_as_it_was() {
        let connection = two_copies_of_one_tenant().await;

        // the history is the last thing a pass reads, after it has planned the tenant's writes.
        run(&connection, "ALTER TABLE history RENAME TO history_gone").await;

        let before = rows(
            &connection,
            "SELECT id, merged_into FROM tenant ORDER BY id",
        )
        .await;

        assert!(pass(&connection).await.is_err());
        assert_eq!(
            rows(
                &connection,
                "SELECT id, merged_into FROM tenant ORDER BY id"
            )
            .await,
            before
        );

        // and a write refused part way takes back the ones before it.
        assert!(
            written(
                &connection,
                vec![
                    (
                        format!("UPDATE tenant SET merged_into = '{T1}' WHERE id = '{T2}'"),
                        vec![]
                    ),
                    ("UPDATE nowhere SET nothing = 1".to_string(), vec![]),
                ],
            )
            .await
            .is_err()
        );
        assert_eq!(
            rows(
                &connection,
                "SELECT id, merged_into FROM tenant ORDER BY id"
            )
            .await,
            before
        );
    }
}
