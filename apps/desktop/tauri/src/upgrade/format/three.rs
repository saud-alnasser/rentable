//! the change from format 2 to format 3: a member's override for one workspace, as a signed row of
//! its own holding what is pinned for them there and which of it is on (effort 838, requirement 12
//! as amended a third time, tickets 53 and 55). What runs it, and what every change of format
//! shares, is `runner.rs`; where it sits in the order is [`super::TRANSITIONS`]. *The row held
//! one mask switched over the layers beneath until review round one; format 3 had not shipped, so
//! it was changed here rather than by a format of its own.*
//!
//! **An empty table is the whole change.** Format 3 adds `workspace_override` and touches nothing
//! else, so an organization of format 2 keeps every row as it was signed, every member keeps
//! exactly what they could do, and nobody is overridden in any workspace until somebody holding
//! `overrideMember` says so. The table is created where it is missing, so a walk cut short and run
//! again, or a directory whose `format` row somebody took away, is finished by running it again
//! (`store::format_as_it_stands` reads a directory with neither the table nor a row as format 2).
//!
//! **It refuses no directory.** Nothing a member can put back makes a directory of format 3 look
//! like one of format 2 but a dropped table, and dropping it only loses the overrides it held,
//! which the credential already allows by deleting their rows.
//!
//! **Its readers are format 2's** ([`super::two`]): the member rows and the grants of format 2 are
//! those of format 3, since the change adds a table and reshapes none, so what finds the owner's
//! vault and grant in the format this starts from finds them in the one it arrives at too.

use crate::organization::store::install;

use super::{Pending, Transition, Upgrading, two};

/// The change from format 2, as [`super::TRANSITIONS`] lists it.
pub(crate) const TRANSITION: Transition = Transition {
    from: 2,
    name: "format 2 to 3",
    members: two::TRANSITION.members,
    signed_as_its_own: two::TRANSITION.signed_as_its_own,
    grant: two::TRANSITION.grant,
    refused,
    run,
    built,
    kept: &[],
};

/// A fresh organization of format 3: the schema this build installs. Only the last change's is
/// read (`runner.rs`), so the next format's change builds its own and this one is read only where
/// a walk ends here.
fn built(connection: &turso::Connection) -> Pending<'_, ()> {
    Box::pin(install(connection))
}

/// A directory of format 2 is never refused this change (the module comment says why).
fn refused<'a>(_: &'a Upgrading<'a>) -> Pending<'a, Option<&'static str>> {
    Box::pin(async { Ok(None) })
}

/// The `workspace_override` table, where it does not stand yet, inside the runner's transaction.
fn run<'a>(upgrading: &'a Upgrading<'a>) -> Pending<'a, ()> {
    Box::pin(upgrading.store.install_format_three_schema())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::TRANSITION;
    use crate::{
        backup,
        organization::{
            session::CredentialSlot,
            store::{FORMAT_VERSION, OrganizationStore},
        },
        upgrade::format::{
            TRANSITIONS,
            runner::{with_password, with_password_over},
            test::{
                older::{NOW, ORGANIZATION_ID, Older, assert_upgraded, older, run},
                remote::online,
            },
        },
    };

    /// A credential slot holding nothing yet.
    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// Every table but `format` and `workspace_override`, row by row: what format 3 leaves as it
    /// found it.
    async fn contents_but_the_change(
        store: &OrganizationStore,
    ) -> Vec<(String, Vec<Vec<turso::Value>>)> {
        let mut contents = Vec::new();

        for table in store.tables().await.expect("the tables") {
            if table == "format" || table == "workspace_override" {
                continue;
            }

            let mut rows = store
                .connection()
                .query(&format!("SELECT * FROM \"{table}\" ORDER BY rowid"), ())
                .await
                .expect("the rows");
            let mut values = Vec::new();

            while let Some(row) = rows.next().await.expect("a row") {
                values.push(
                    (0..row.column_count())
                        .map(|index| row.get_value(index).expect("a value"))
                        .collect(),
                );
            }

            contents.push((table, values));
        }

        contents
    }

    /// Whether the organization holds the table format 3 adds.
    async fn holds_the_table(store: &OrganizationStore) -> bool {
        store
            .tables()
            .await
            .expect("the tables")
            .iter()
            .any(|table| table == "workspace_override")
    }

    /// The name of every copy on this machine of the organization `older` holds.
    fn copies_in(older: &Older) -> Vec<String> {
        let directory = backup::directory_of(&older.directory, &format!("org-{ORGANIZATION_ID}"));
        let mut names: Vec<String> = std::fs::read_dir(directory)
            .map(|entries| {
                entries
                    .flatten()
                    .map(|entry| entry.file_name().to_string_lossy().into_owned())
                    .collect()
            })
            .unwrap_or_default();

        names.sort();
        names
    }

    /// **The seeded database of the version before** (`rules/migrations`): the format 1 fixture,
    /// walked by its owner's sign-in through the changes up to format 2 and no further, as the
    /// build before this one left every organization.
    async fn of_format_two(name: &str) -> (Older, OrganizationStore) {
        let older = older(name).await;
        let store = older.open().await;
        let owner = older.person("owner");

        with_password_over(
            &TRANSITIONS[..1],
            &store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW,
        )
        .await
        .expect("the upgrade to format 2");

        assert_eq!(store.format().await.expect("the format"), Some(2));
        assert!(
            !holds_the_table(&store).await,
            "format 2 held format 3's table"
        );

        (older, store)
    }

    /// The owner of `older` signs in on this build, online.
    async fn signed_in_by_the_owner(older: &Older, store: &OrganizationStore) {
        let owner = older.person("owner");

        with_password(
            store,
            &online(),
            &older.held,
            owner.username,
            owner.password,
            &slot(),
            NOW + 60_000,
        )
        .await
        .expect("the upgrade to format 3");
    }

    #[test]
    fn it_starts_where_format_two_ends_and_is_the_last_change() {
        assert_eq!(TRANSITION.from, 2);
        assert_eq!(
            TRANSITIONS.last().map(|last| last.from),
            Some(TRANSITION.from)
        );
        assert_eq!(FORMAT_VERSION, 3);
    }

    /// **Ticket 53's first criterion.** An organization of format 2 is walked to format 3 by its
    /// owner's sign-in, through the same runner and its copy: the table stands and is empty, the
    /// `format` row says 3, every other row is as format 2 left it, and every member reads as the
    /// upgrade from format 1 left them, here and on a machine holding only the pinned key.
    #[tokio::test]
    async fn an_organization_of_format_two_is_walked_to_three_with_its_copy_and_every_row_kept() {
        let (older, store) = of_format_two("format-two-to-three").await;
        let before = contents_but_the_change(&store).await;

        signed_in_by_the_owner(&older, &store).await;

        assert_eq!(store.format().await.expect("the format"), Some(3));
        assert!(
            holds_the_table(&store).await,
            "format 3's table was not created"
        );
        assert!(
            store
                .workspace_overrides(&older.pinned())
                .await
                .expect("the workspace overrides")
                .is_empty(),
            "the change overrode somebody"
        );
        assert_eq!(
            contents_but_the_change(&store).await,
            before,
            "the change to format 3 wrote a row it had no business with"
        );
        assert!(
            copies_in(&older)
                .iter()
                .any(|copy| copy.starts_with("format-2-to-3-")),
            "the runner took no copy before format 3: {:?}",
            copies_in(&older)
        );

        assert_upgraded(&store, &older, &older.pinned()).await;
    }

    /// A directory of format 2 whose `format` row somebody took away reads as format 2, not as the
    /// format this build ships, and the owner's next sign-in finishes it; one that holds the table
    /// with no row reads as format 3 and is only given its row.
    #[tokio::test]
    async fn a_directory_with_no_row_reads_as_format_two_until_it_holds_the_table() {
        let (older, store) = of_format_two("format-two-without-its-row").await;

        run(&store, "DELETE FROM \"format\"", Vec::new()).await;

        assert_eq!(
            store
                .format_as_it_stands(FORMAT_VERSION)
                .await
                .expect("the format"),
            2
        );

        signed_in_by_the_owner(&older, &store).await;

        assert_eq!(store.format().await.expect("the format"), Some(3));
        assert!(holds_the_table(&store).await);

        run(&store, "DELETE FROM \"format\"", Vec::new()).await;

        assert_eq!(
            store
                .format_as_it_stands(FORMAT_VERSION)
                .await
                .expect("the format"),
            FORMAT_VERSION
        );
    }
}
