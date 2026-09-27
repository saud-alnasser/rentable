//! every change of an organization's format, in order: what its owner's upgrade walks, from the
//! format the organization is in to the one this build ships (effort 838, requirement 14, ticket
//! 26).
//!
//! **One file for each change, and this list the one place they are named in order.** What every
//! change needs is written once, in `upgrade.rs`: finding the owner, the push and the pull before
//! it, the refusal of an organization this machine has read in a later format, the one
//! transaction, the `format` row last, and the push after. A change holds only what is its own:
//! the check that refuses the directory as it stands, and the plan it makes and applies inside
//! that transaction. The format this build ships is counted from the list
//! (`store::FORMAT_VERSION`), the way `build.rs` counts the workspace migrations.
//!
//! **The next format is added in four moves**: a file here, named for the format it makes, one
//! word as every Rust file is (`three.rs`), holding the change and a `TRANSITION` built from it; that entry at the end of [`TRANSITIONS`], which moves the shipped format on by
//! one; the tables the new format adds in `store::install_schema`, so an organization this build
//! creates starts in it; and a test in the file that walks an organization of the format before it
//! through the change.
//!
//! **Plain functions returning boxed futures, not an `async` trait**, because `async fn` in a trait
//! is not object safe on this toolchain and the list is a constant.

use std::{future::Future, pin::Pin};

use crate::error::Error;

use super::{
    authority::{AdministratorKey, OrganizationKey, VERIFYING_KEY_BYTES},
    store::OrganizationStore,
    upgrade::Opened,
};

pub mod two;

/// Every change of format, in order: the one starting from format 1 first, and each after it
/// starting where the one before it ends.
pub(crate) const TRANSITIONS: &[Transition] = &[two::TRANSITION];

/// What a change of format hands the runner to await, borrowing what it was given.
pub(crate) type Pending<'a, T> = Pin<Box<dyn Future<Output = Result<T, Error>> + Send + 'a>>;

/// The owner's upgrade under way, as every change of format is given it.
pub(crate) struct Upgrading<'a> {
    pub(crate) store: &'a OrganizationStore,
    /// the key the organization is on now, settled along any handover it holds, which is the one
    /// the owner's secret derives.
    pub(crate) key: &'a [u8; VERIFYING_KEY_BYTES],
    pub(crate) organization_key: &'a OrganizationKey,
    /// the key the owner signs rows with, which their own secret derives.
    pub(crate) signing_key: &'a AdministratorKey,
    /// the owner's vault, and the member row it sits on.
    pub(crate) opened: &'a Opened,
    pub(crate) now: i64,
}

/// One change of format, from `from` to the format after it.
#[derive(Clone, Copy)]
pub(crate) struct Transition {
    /// the format it starts from.
    pub(crate) from: i64,
    /// how the log names it.
    pub(crate) name: &'static str,
    /// why the directory as it stands is not to be changed, where it is not: read before anything
    /// is written, and a refusal writes nothing.
    pub(crate) refused: for<'a> fn(&'a Upgrading<'a>) -> Pending<'a, Option<&'static str>>,
    /// the change, planned over the directory as the changes before it left it and applied,
    /// inside the runner's transaction.
    pub(crate) run: for<'a> fn(&'a Upgrading<'a>) -> Pending<'a, ()>,
}

#[cfg(test)]
mod tests {
    use super::{TRANSITIONS, Transition, Upgrading};
    use crate::organization::store::FORMAT_VERSION;

    /// Whether `transitions` start from format 1 and each from the one after the last.
    fn in_order(transitions: &[Transition]) -> bool {
        transitions
            .iter()
            .enumerate()
            .all(|(place, transition)| transition.from == place as i64 + 1)
    }

    /// A change that refuses nothing and writes nothing, starting from `from`.
    fn from(from: i64) -> Transition {
        fn refused<'a>(_: &'a Upgrading<'a>) -> super::Pending<'a, Option<&'static str>> {
            Box::pin(async { Ok(None) })
        }

        fn run<'a>(_: &'a Upgrading<'a>) -> super::Pending<'a, ()> {
            Box::pin(async { Ok(()) })
        }

        Transition {
            from,
            name: "a change",
            refused,
            run,
        }
    }

    /// **Ticket 26's third criterion.** The list starts from format 1 and moves by one, and the
    /// format this build ships is the one after its last change.
    #[test]
    fn the_list_starts_from_format_one_and_the_shipped_format_is_counted_from_it() {
        assert!(in_order(TRANSITIONS));
        assert_eq!(FORMAT_VERSION, TRANSITIONS.len() as i64 + 1);
        assert_eq!(
            TRANSITIONS.last().map(|transition| transition.from + 1),
            Some(FORMAT_VERSION)
        );
    }

    /// The check the test above leans on fails a list that skips a format, repeats one, or does
    /// not start from format 1.
    #[test]
    fn a_list_that_skips_or_repeats_a_format_fails() {
        assert!(in_order(&[from(1), from(2), from(3)]));
        assert!(!in_order(&[from(1), from(3)]), "a skipped format");
        assert!(!in_order(&[from(1), from(1), from(2)]), "a repeated format");
        assert!(!in_order(&[from(2), from(3)]), "a list not starting from 1");
        assert!(!in_order(&[from(2), from(1)]), "a list out of order");
    }
}
