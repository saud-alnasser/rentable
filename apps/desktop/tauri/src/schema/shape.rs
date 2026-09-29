//! a database's structure as the check compares it: each table's columns, indexes and foreign keys,
//! and its views and triggers by their statements, read from what an engine answers.

use std::collections::{BTreeMap, BTreeSet};

use super::normalised;
use crate::error::Error;

/// One row [`columns`](super::columns) answers: table, column, declared type, `NOT NULL`, primary key place.
pub type ColumnRow = (String, String, String, bool, i64);

/// One row [`indexes`](super::indexes) answers: table, index, origin, unique, partial, the column's place in the
/// table, and its name (none for an expression).
pub type IndexRow = (String, String, String, bool, bool, i64, Option<String>);

/// One row [`foreign_keys`](super::foreign_keys) answers: table, key, place in the key, parent table, column, parent's
/// column (none where the statement left it to the parent's primary key), `ON UPDATE`,
/// `ON DELETE`.
pub type ForeignKeyRow = (
    String,
    i64,
    i64,
    String,
    String,
    Option<String>,
    String,
    String,
);

/// What an index's column is called where it is an expression rather than a column.
const EXPRESSION: &str = "<expression>";

/// A column as the check compares it. Its place among the table's columns and its default are
/// not part of it.
#[derive(Clone, Debug, PartialEq, Eq)]
struct Column {
    /// the declared type, [`normalised`].
    declared: String,
    not_null: bool,
    /// its place in the primary key, from 1, or 0 where it is not in it.
    primary_key: i64,
}

/// An index as the check compares it.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct Index {
    table: String,
    /// `c` for one a statement created, `u` or `pk` for one SQLite made for a constraint.
    origin: String,
    unique: bool,
    partial: bool,
    /// the `WHERE` of the statement that created it, [`normalised`], where it has one.
    predicate: Option<String>,
    /// its columns in order, an expression as [`EXPRESSION`].
    columns: Vec<String>,
}

impl Index {
    /// How a difference names it: `unique, on note(body, id) where pinned = 1`, or for one SQLite
    /// made, `the index of its unique constraint on (code)`.
    fn described(&self) -> String {
        let partial = match (&self.predicate, self.partial) {
            (Some(predicate), _) => format!(" where {predicate}"),
            (None, true) => ", partial".to_string(),
            (None, false) => String::new(),
        };

        match self.origin.as_str() {
            "c" => format!(
                "{}on {}({}){partial}",
                if self.unique { "unique, " } else { "" },
                self.table,
                self.columns.join(", ")
            ),
            origin => format!(
                "the index of its {} on ({}){}{partial}",
                if origin == "pk" {
                    "primary key"
                } else {
                    "unique constraint"
                },
                self.columns.join(", "),
                if self.unique { "" } else { ", not unique" }
            ),
        }
    }
}

/// A foreign key as the check compares it.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct ForeignKey {
    parent: String,
    /// each column and the parent's column it names, in order; the parent's is empty where the
    /// statement left it to the parent's primary key.
    columns: Vec<(String, String)>,
    on_update: String,
    on_delete: String,
}

impl ForeignKey {
    /// How a difference names it: `(parent_id) references parent(id) on update no action on
    /// delete cascade`.
    fn described(&self) -> String {
        let (own, parents): (Vec<&str>, Vec<&str>) = self
            .columns
            .iter()
            .map(|(own, parent)| (own.as_str(), parent.as_str()))
            .unzip();
        let parent = if parents.iter().all(|column| column.is_empty()) {
            self.parent.clone()
        } else {
            format!("{}({})", self.parent, parents.join(", "))
        };

        format!(
            "({}) references {parent} on update {} on delete {}",
            own.join(", "),
            self.on_update.to_ascii_lowercase(),
            self.on_delete.to_ascii_lowercase()
        )
    }
}

/// A database's schema as the check compares it: each table by its columns and its foreign keys,
/// each index by its table, origin, uniqueness, partiality, predicate and columns, and each view
/// and trigger by its statement [`normalised`]. Every name is folded to lower case, as SQLite
/// matches names.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Shape {
    /// each table, its columns by name.
    tables: BTreeMap<String, BTreeMap<String, Column>>,
    /// each index a statement created, by name.
    indexes: BTreeMap<String, Index>,
    /// each index SQLite made for a table's constraint, by table, sorted: known by what it is and
    /// not by its name, which only counts the table's constraints.
    constraints: BTreeMap<String, Vec<Index>>,
    /// each table's foreign keys, sorted, whatever order the table declares them in.
    foreign_keys: BTreeMap<String, Vec<ForeignKey>>,
    /// each view and trigger by kind and name.
    statements: BTreeMap<(String, String), String>,
    /// each table and index, by kind and name, the listing named and the pragmas answered
    /// nothing for, and each table, as `foreign keys`, whose statement declares a `REFERENCES` its
    /// foreign keys were read without: a difference wherever it is, since it was not read.
    unread: BTreeSet<(String, String)>,
}

impl Shape {
    /// The shape of what [`backup::listing`](crate::backup::listing), [`columns`](super::columns), [`indexes`](super::indexes) and [`foreign_keys`](super::foreign_keys)
    /// answered, read in one transaction.
    pub fn of(
        listed: impl IntoIterator<Item = (String, String, String)>,
        columns: impl IntoIterator<Item = ColumnRow>,
        indexes: impl IntoIterator<Item = IndexRow>,
        foreign_keys: impl IntoIterator<Item = ForeignKeyRow>,
    ) -> Self {
        let mut shape = Self::default();
        let mut structural = Vec::new();
        let mut index_statements = BTreeMap::new();

        for (table, name, declared, not_null, primary_key) in columns {
            shape
                .tables
                .entry(table.to_ascii_lowercase())
                .or_default()
                .insert(
                    name.to_ascii_lowercase(),
                    Column {
                        declared: normalised(&declared),
                        not_null,
                        primary_key,
                    },
                );
        }

        for (kind, name, statement) in listed {
            let name = name.to_ascii_lowercase();
            let statement = normalised(&statement);

            if kind == "table" || kind == "index" {
                if kind == "index" {
                    index_statements.insert(name.clone(), statement.clone());
                }

                structural.push((kind, name, statement));
            } else {
                shape.statements.insert((kind, name), statement);
            }
        }

        let mut read_indexes: BTreeMap<(String, String), Index> = BTreeMap::new();

        for (table, index, origin, unique, partial, place, column) in indexes {
            let table = table.to_ascii_lowercase();
            let index = index.to_ascii_lowercase();
            let origin = origin.to_ascii_lowercase();
            let predicate = if origin == "c" {
                index_statements
                    .get(&index)
                    .and_then(|statement| predicate_of(statement))
            } else {
                None
            };

            read_indexes
                .entry((table.clone(), index))
                .or_insert_with(|| Index {
                    table,
                    origin,
                    unique,
                    partial,
                    predicate,
                    columns: Vec::new(),
                })
                .columns
                .push(match column {
                    Some(column) if place != -1 => column.to_ascii_lowercase(),
                    _ => EXPRESSION.to_string(),
                });
        }

        for ((table, name), index) in read_indexes {
            if index.origin == "c" {
                shape.indexes.insert(name, index);
            } else {
                shape.constraints.entry(table).or_default().push(index);
            }
        }

        for constraints in shape.constraints.values_mut() {
            constraints.sort();
        }

        let mut read_keys: BTreeMap<(String, i64), ForeignKey> = BTreeMap::new();

        for (table, key, _, parent, column, parents, on_update, on_delete) in foreign_keys {
            read_keys
                .entry((table.to_ascii_lowercase(), key))
                .or_insert_with(|| ForeignKey {
                    parent: parent.to_ascii_lowercase(),
                    columns: Vec::new(),
                    on_update: on_update.to_ascii_uppercase(),
                    on_delete: on_delete.to_ascii_uppercase(),
                })
                .columns
                .push((
                    column.to_ascii_lowercase(),
                    parents.unwrap_or_default().to_ascii_lowercase(),
                ));
        }

        for ((table, _), key) in read_keys {
            shape.foreign_keys.entry(table).or_default().push(key);
        }

        for keys in shape.foreign_keys.values_mut() {
            keys.sort();
        }

        for (kind, name, statement) in structural {
            let read = if kind == "table" {
                shape.tables.contains_key(&name)
            } else {
                shape.indexes.contains_key(&name)
            };

            // a `REFERENCES` in a table's statement that no foreign key was read for.
            if kind == "table"
                && statement.contains(" references ")
                && !shape.foreign_keys.contains_key(&name)
            {
                shape
                    .unread
                    .insert(("foreign keys".to_string(), name.clone()));
            }

            if !read {
                shape.unread.insert((kind, name));
            }
        }

        shape
    }

    /// The shape of the same four reads, each row as the engine's values: what the pipeline and
    /// the turso engine answer.
    pub fn of_values(
        listed: &[Vec<turso::Value>],
        columns: &[Vec<turso::Value>],
        indexes: &[Vec<turso::Value>],
        foreign_keys: &[Vec<turso::Value>],
    ) -> Result<Self, Error> {
        let listed = listed
            .iter()
            .map(|row| Ok((text(row, 0)?, text(row, 1)?, text(row, 2)?)))
            .collect::<Result<Vec<_>, Error>>()?;
        let columns = columns
            .iter()
            .map(|row| {
                Ok((
                    text(row, 0)?,
                    text(row, 1)?,
                    text(row, 2)?,
                    integer(row, 3)? != 0,
                    integer(row, 4)?,
                ))
            })
            .collect::<Result<Vec<ColumnRow>, Error>>()?;
        let indexes = indexes
            .iter()
            .map(|row| {
                Ok((
                    text(row, 0)?,
                    text(row, 1)?,
                    text(row, 2)?,
                    integer(row, 3)? != 0,
                    integer(row, 4)? != 0,
                    integer(row, 5)?,
                    optional_text(row, 6)?,
                ))
            })
            .collect::<Result<Vec<IndexRow>, Error>>()?;
        let foreign_keys = foreign_keys
            .iter()
            .map(|row| {
                Ok((
                    text(row, 0)?,
                    integer(row, 1)?,
                    integer(row, 2)?,
                    text(row, 3)?,
                    text(row, 4)?,
                    optional_text(row, 5)?,
                    text(row, 6)?,
                    text(row, 7)?,
                ))
            })
            .collect::<Result<Vec<ForeignKeyRow>, Error>>()?;

        Ok(Self::of(listed, columns, indexes, foreign_keys))
    }

    /// This shape without the tables named, and without any index, view or trigger on them: for a
    /// table a caller keeps beside what a version builds.
    pub fn without(mut self, tables: &[&str]) -> Self {
        let named = |name: &str| tables.iter().any(|table| table.eq_ignore_ascii_case(name));

        self.tables.retain(|name, _| !named(name));
        self.indexes.retain(|_, index| !named(&index.table));
        self.constraints.retain(|table, _| !named(table));
        self.foreign_keys.retain(|table, _| !named(table));
        self.statements.retain(|(_, name), statement| {
            !named(name)
                && !tables.iter().any(|table| {
                    let table = table.to_ascii_lowercase();

                    statement.contains(&format!(" on {table} "))
                        || statement.contains(&format!(" on {table}("))
                })
        });
        self.unread
            .retain(|(kind, name)| !((kind == "table" || kind == "foreign keys") && named(name)));

        self
    }

    /// What this shape has that `fresh` does not, what `fresh` has that it lacks, and what both
    /// have otherwise, one sentence each: tables, then indexes, then the indexes SQLite made for a
    /// constraint and the foreign keys, each by table, then views and triggers, each by name; and
    /// last, whatever either side could not read.
    pub(super) fn differences(&self, fresh: &Shape) -> Vec<String> {
        let mut differences = Vec::new();

        for (name, columns) in &self.tables {
            match fresh.tables.get(name) {
                None => differences.push(format!("table {name} is not in a fresh database")),
                Some(built) => {
                    let columns = column_differences(columns, built);

                    if !columns.is_empty() {
                        differences.push(format!(
                            "table {name} is not as a fresh database has it ({})",
                            columns.join(", ")
                        ));
                    }
                }
            }
        }

        differences.extend(
            fresh
                .tables
                .keys()
                .filter(|name| !self.tables.contains_key(*name))
                .map(|name| format!("table {name} is missing")),
        );

        for (name, index) in &self.indexes {
            match fresh.indexes.get(name) {
                None => differences.push(format!("index {name} is not in a fresh database")),
                Some(built) if built != index => differences.push(format!(
                    "index {name} is not as a fresh database has it ({}, where a fresh one is {})",
                    index.described(),
                    built.described()
                )),
                Some(_) => {}
            }
        }

        differences.extend(
            fresh
                .indexes
                .keys()
                .filter(|name| !self.indexes.contains_key(*name))
                .map(|name| format!("index {name} is missing")),
        );

        for (table, found, built) in by_table(&self.constraints, &fresh.constraints) {
            differences.extend(unmatched(found, built).into_iter().map(|index| {
                format!(
                    "table {table} has {} where a fresh database does not",
                    index.described()
                )
            }));
            differences.extend(
                unmatched(built, found)
                    .into_iter()
                    .map(|index| format!("table {table} is missing {}", index.described())),
            );
        }

        for (table, found, built) in by_table(&self.foreign_keys, &fresh.foreign_keys) {
            differences.extend(unmatched(found, built).into_iter().map(|key| {
                format!(
                    "table {table} has the foreign key {} where a fresh database does not",
                    key.described()
                )
            }));
            differences.extend(unmatched(built, found).into_iter().map(|key| {
                format!(
                    "table {table} is missing its foreign key {}",
                    key.described()
                )
            }));
        }

        for ((kind, name), statement) in &self.statements {
            match fresh.statements.get(&(kind.clone(), name.clone())) {
                None => differences.push(format!("{kind} {name} is not in a fresh database")),
                Some(built) if built != statement => {
                    differences.push(format!("{kind} {name} is not as a fresh database has it"))
                }
                Some(_) => {}
            }
        }

        differences.extend(
            fresh
                .statements
                .keys()
                .filter(|key| !self.statements.contains_key(*key))
                .map(|(kind, name)| format!("{kind} {name} is missing")),
        );

        for ((kind, name), whose) in self
            .unread
            .iter()
            .map(|object| (object, "the database's"))
            .chain(
                fresh
                    .unread
                    .iter()
                    .map(|object| (object, "a fresh database's")),
            )
        {
            differences.push(if kind == "foreign keys" {
                format!(
                    "{whose} table {name} declares a foreign key its pragma answered nothing for, \
                     so its foreign keys were not read"
                )
            } else {
                format!("{whose} {kind} {name} answered nothing to its pragma, so it was not read")
            });
        }

        differences
    }
}

/// How the columns of one table differ from a fresh one's, one phrase each, by name.
fn column_differences(
    found: &BTreeMap<String, Column>,
    fresh: &BTreeMap<String, Column>,
) -> Vec<String> {
    let declared = |column: &Column| {
        if column.declared.is_empty() {
            "without a type".to_string()
        } else {
            column.declared.clone()
        }
    };
    let place = |primary_key: i64| {
        if primary_key == 0 {
            "not in the primary key".to_string()
        } else {
            format!("primary key place {primary_key}")
        }
    };
    let mut differences = Vec::new();

    for (name, column) in found {
        let Some(built) = fresh.get(name) else {
            differences.push(format!("column {name} is not in a fresh one"));

            continue;
        };

        if column.declared != built.declared {
            differences.push(format!(
                "column {name} is {} where a fresh one is {}",
                declared(column),
                declared(built)
            ));
        }

        if column.not_null != built.not_null {
            differences.push(if built.not_null {
                format!("column {name} may be null where a fresh one is not null")
            } else {
                format!("column {name} is not null where a fresh one may be null")
            });
        }

        if column.primary_key != built.primary_key {
            differences.push(format!(
                "column {name} is {} where a fresh one is {}",
                place(column.primary_key),
                place(built.primary_key)
            ));
        }
    }

    differences.extend(
        fresh
            .keys()
            .filter(|name| !found.contains_key(*name))
            .map(|name| format!("column {name} is missing")),
    );

    differences
}

/// Each table either side has something of, with what each side has of it, empty where it has
/// nothing.
fn by_table<'a, T>(
    found: &'a BTreeMap<String, Vec<T>>,
    fresh: &'a BTreeMap<String, Vec<T>>,
) -> Vec<(&'a str, &'a [T], &'a [T])> {
    found
        .keys()
        .chain(fresh.keys())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .map(|table| {
            (
                table.as_str(),
                found.get(table).map(Vec::as_slice).unwrap_or_default(),
                fresh.get(table).map(Vec::as_slice).unwrap_or_default(),
            )
        })
        .collect()
}

/// Each of `these` that `those` has no match for, a match counted once: the two compared as
/// lists that may hold one thing twice.
fn unmatched<'a, T: PartialEq>(these: &'a [T], those: &[T]) -> Vec<&'a T> {
    let mut left: Vec<&T> = those.iter().collect();

    these
        .iter()
        .filter(|item| match left.iter().position(|other| other == item) {
            Some(at) => {
                left.remove(at);

                false
            }
            None => true,
        })
        .collect()
}

/// The predicate of a partial index, from its statement [`normalised`]: what follows the `WHERE`
/// after its columns, where there is one.
fn predicate_of(statement: &str) -> Option<String> {
    statement
        .find(") where ")
        .map(|at| statement[at + ") where ".len()..].to_string())
}

/// The `index`th value of `row` as text, or none where it is null.
fn optional_text(row: &[turso::Value], index: usize) -> Result<Option<String>, Error> {
    match row.get(index) {
        Some(turso::Value::Null) => Ok(None),
        _ => text(row, index).map(Some),
    }
}

/// The `index`th value of `row` as text.
pub(super) fn text(row: &[turso::Value], index: usize) -> Result<String, Error> {
    match row.get(index) {
        Some(turso::Value::Text(text)) => Ok(text.clone()),
        other => Err(unreadable(index, other)),
    }
}

/// The `index`th value of `row` as an integer.
fn integer(row: &[turso::Value], index: usize) -> Result<i64, Error> {
    match row.get(index) {
        Some(turso::Value::Integer(integer)) => Ok(*integer),
        other => Err(unreadable(index, other)),
    }
}

/// The failure of a read that answered something the check cannot compare.
fn unreadable(index: usize, value: Option<&turso::Value>) -> Error {
    Error::Integrity {
        message: format!(
            "the schema check read {value:?} in column {index}, which it cannot compare"
        ),
    }
}
