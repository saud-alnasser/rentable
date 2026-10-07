//! the statements a connection wrote, kept so the same writes can be sent to another database.
//!
//! **What it is for** (effort 857, ticket 24): the organization's upgrade runs its changes of
//! format on this machine, which holds the keys a signed row is signed with, against a copy of the
//! organization read inside a transaction at the primary, and then sends what they wrote to the
//! primary in that same transaction. A change is written against the organization's store, as
//! every change of format is, and never against the pipeline; this is what turns what it did into
//! statements the pipeline takes.
//!
//! **Kept is every statement that can change the database, in order, with the values bound to
//! it.** A read (`SELECT`, `VALUES`, `EXPLAIN`, a `PRAGMA` that sets nothing) is not kept, and
//! neither is the transaction around the writes (`BEGIN`, `COMMIT`, `END`, `SAVEPOINT`,
//! `RELEASE`), since the transaction they are sent in is the receiver's. A statement starting
//! with `WITH` is kept, since it may write, and sending a read again changes nothing.
//!
//! **What it cannot stand for spoils it, and a spoiled one sends nothing** ([`Replay::taken`]):
//! a `ROLLBACK`, since the writes it undid were kept; a `PRAGMA` that sets something, since the
//! receiver's settings are its own; and values bound by name, which the pipeline is not sent.
//! Writes made on the same copy from the same starting state are the same writes, which is what
//! sending them again rests on, so nothing here guesses where it could refuse.

use std::sync::{Mutex, PoisonError};

use turso::params::Params;

use crate::error::Error;

/// One statement kept, with the values bound to it in order.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Statement {
    pub(crate) sql: String,
    pub(crate) values: Vec<turso::Value>,
}

/// What a connection wrote while it was kept, or why it can no longer be sent.
#[derive(Debug, Default)]
pub(crate) struct Replay {
    kept: Mutex<Kept>,
}

#[derive(Debug, Default)]
struct Kept {
    /// whether the writes are kept now: off until [`Replay::start`].
    on: bool,
    statements: Vec<Statement>,
    /// the first thing met that what is kept cannot stand for.
    spoiled: Option<String>,
}

/// What a statement is, by its first word.
#[derive(Debug, PartialEq, Eq)]
enum Kind {
    Read,
    Transaction,
    Undo,
    Setting,
    Write,
}

impl Replay {
    /// Keep every write from here on.
    pub(crate) fn start(&self) {
        self.kept().on = true;
    }

    /// Note `sql`, about to run with `params`, keeping it where it writes, and answer the params
    /// for the run.
    pub(crate) fn note(&self, sql: &str, params: Params) -> Params {
        let mut kept = self.kept();

        if !kept.on || kept.spoiled.is_some() {
            return params;
        }

        match kind(sql) {
            Kind::Read | Kind::Transaction => {}
            Kind::Undo => {
                kept.spoiled = Some(format!("a rollback undid writes it had kept ({sql})"));
            }
            Kind::Setting => {
                kept.spoiled = Some(format!("a pragma set something ({sql})"));
            }
            Kind::Write => match &params {
                Params::None => kept.statements.push(Statement {
                    sql: sql.to_string(),
                    values: Vec::new(),
                }),
                Params::Positional(values) => kept.statements.push(Statement {
                    sql: sql.to_string(),
                    values: values.clone(),
                }),
                Params::Named(_) => {
                    kept.spoiled = Some(format!("values were bound by name ({sql})"));
                }
            },
        }

        params
    }

    /// Every write kept, in order, or the refusal of a replay something spoiled.
    pub(crate) fn taken(&self) -> Result<Vec<Statement>, Error> {
        let mut kept = self.kept();

        if let Some(spoiled) = kept.spoiled.take() {
            return Err(Error::Internal {
                message: format!(
                    "the writes could not be kept to be sent again: {spoiled}; nothing was sent"
                ),
            });
        }

        Ok(std::mem::take(&mut kept.statements))
    }

    fn kept(&self) -> std::sync::MutexGuard<'_, Kept> {
        self.kept.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// What `sql` is, read off its first word, ASCII case folded.
fn kind(sql: &str) -> Kind {
    let trimmed = sql.trim_start();
    let first: String = trimmed
        .chars()
        .take_while(|character| character.is_ascii_alphabetic())
        .collect::<String>()
        .to_ascii_uppercase();

    match first.as_str() {
        "SELECT" | "VALUES" | "EXPLAIN" => Kind::Read,
        "PRAGMA" if trimmed.contains('=') => Kind::Setting,
        "PRAGMA" => Kind::Read,
        "BEGIN" | "COMMIT" | "END" | "SAVEPOINT" | "RELEASE" => Kind::Transaction,
        "ROLLBACK" => Kind::Undo,
        _ => Kind::Write,
    }
}

#[cfg(test)]
mod tests {
    use turso::params::Params;

    use super::{Replay, Statement};

    fn text(value: &str) -> turso::Value {
        turso::Value::Text(value.to_string())
    }

    /// Nothing is kept before it starts; then every write is, in order with its values, and
    /// reads, pragmas that set nothing and the transaction around them are not.
    #[test]
    fn writes_are_kept_in_order_and_reads_and_the_transaction_are_not() {
        let replay = Replay::default();

        replay.note(
            "INSERT INTO t VALUES (?)",
            Params::Positional(vec![text("before")]),
        );
        replay.start();

        for (sql, params) in [
            ("BEGIN", Params::None),
            ("SELECT * FROM t", Params::None),
            ("  select 1", Params::None),
            ("PRAGMA table_info(\"t\")", Params::None),
            (
                "INSERT INTO t VALUES (?)",
                Params::Positional(vec![text("a")]),
            ),
            ("SAVEPOINT s", Params::None),
            (
                "update t SET v = ?",
                Params::Positional(vec![turso::Value::Integer(2)]),
            ),
            ("RELEASE s", Params::None),
            ("WITH x AS (SELECT 1) DELETE FROM t", Params::None),
            ("COMMIT", Params::None),
        ] {
            replay.note(sql, params);
        }

        assert_eq!(
            replay.taken().expect("kept"),
            vec![
                Statement {
                    sql: "INSERT INTO t VALUES (?)".to_string(),
                    values: vec![text("a")],
                },
                Statement {
                    sql: "update t SET v = ?".to_string(),
                    values: vec![turso::Value::Integer(2)],
                },
                Statement {
                    sql: "WITH x AS (SELECT 1) DELETE FROM t".to_string(),
                    values: Vec::new(),
                },
            ]
        );
    }

    /// A rollback, a pragma that sets something and values bound by name each spoil it, and a
    /// spoiled replay sends nothing.
    #[test]
    fn what_it_cannot_stand_for_spoils_it() {
        for (sql, params) in [
            ("ROLLBACK", Params::None),
            ("ROLLBACK TO s", Params::None),
            ("PRAGMA foreign_keys = ON", Params::None),
            (
                "INSERT INTO t VALUES (:v)",
                Params::Named(vec![(":v".into(), text("a"))]),
            ),
        ] {
            let replay = Replay::default();

            replay.start();
            replay.note("INSERT INTO t VALUES (1)", Params::None);
            replay.note(sql, params);

            assert!(replay.taken().is_err(), "{sql} did not spoil it");
        }
    }
}
