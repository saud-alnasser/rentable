//! every change of an organization's format, in order: what its owner's upgrade walks, from the
//! format the organization is in to the one this build ships (effort 838, requirement 14, ticket
//! 26).
//!
//! **One file for each change, and this list the one place they are named in order.** What every
//! change needs is written once, in `upgrade.rs`: finding the owner, the push and the pull before
//! it, the refusal of an organization this machine has read in a later format, the copy, the one
//! transaction, the `format` row last, and the push after. A change holds only what is its own:
//! the readers that find a vault and a member's own grant in the format it starts from, the check
//! that refuses the directory as it stands, and the plan it makes and applies inside that
//! transaction. The format this build ships is counted from the list (`store::FORMAT_VERSION`),
//! the way `build.rs` counts the workspace migrations, and the runner counts it from the list it
//! is handed.
//!
//! **The readers are the first due change's** (ticket 29). The runner reads the member rows and
//! the grant through the change that starts from the format the organization is in, or, where it
//! is in the last and only its `format` row is missing or wrong, through the last change's; so a
//! change's readers read the format it starts from, every shape it can leave cut short, and the
//! format it arrives at.
//!
//! **The next format is added in five moves**:
//!
//! 1. a file here, named for the format it makes, one word as every Rust file is (`three.rs`);
//! 2. in it, the change and a `TRANSITION` built from it, reading the format it starts from;
//! 3. that entry at the end of [`TRANSITIONS`], which moves the shipped format on by one;
//! 4. the tables the new format adds in `store::install_schema`, so an organization this build
//!    creates starts in it;
//! 5. a test at the foot of the file that walks an organization of the format before it through
//!    the change.
//!
//! **Plain functions returning boxed futures, not an `async` trait**, because `async fn` in a trait
//! is not object safe on this toolchain and the list is a constant.

use std::{future::Future, pin::Pin};

use crate::error::Error;

use super::{
    authority::{AdministratorKey, OrganizationKey, VERIFYING_KEY_BYTES},
    store::{GrantRecord, OrganizationStore},
    upgrade::Opened,
    vault::{MemberSecretKey, Vault},
};

#[cfg(test)]
pub(crate) mod test;
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

/// A member row as it lies, with nothing judged: what a password or a remembered key is tried
/// against, and all the runner takes from it.
pub(crate) struct Unjudged {
    pub(crate) id: String,
    pub(crate) username_sealed: Vec<u8>,
    pub(crate) vault: Vault,
    pub(crate) sealed_content_key: Vec<u8>,
    pub(crate) session_epoch: i64,
}

/// A change's reader of the grant a member holds on the organization database, given the member
/// sought, the organization's id and, where the member is the owner, the owner's signing key.
pub(crate) type GrantReader = for<'a> fn(
    &'a Sought<'a>,
    &'a str,
    Option<&'a [u8; VERIFYING_KEY_BYTES]>,
) -> Pending<'a, Option<GrantRecord>>;

/// One member, sought in the organization as it stands under the key it is on now.
pub(crate) struct Sought<'a> {
    pub(crate) store: &'a OrganizationStore,
    /// the key the organization is on, settled along any handover it holds.
    pub(crate) key: &'a [u8; VERIFYING_KEY_BYTES],
    pub(crate) member_id: &'a str,
}

/// One change of format, from `from` to the format after it.
#[derive(Clone, Copy)]
pub(crate) struct Transition {
    /// the format it starts from.
    pub(crate) from: i64,
    /// how the log names it.
    pub(crate) name: &'static str,
    /// every member row of the format it starts from, as it lies, read before a pull: what the
    /// runner finds a vault among.
    pub(crate) members: for<'a> fn(&'a OrganizationStore) -> Pending<'a, Vec<Unjudged>>,
    /// whether the row of the member sought, whose vault the secret opened, is that member's own
    /// under the format it starts from: which row is the owner's, where a vault opens on several.
    pub(crate) signed_as_its_own:
        for<'a> fn(&'a Sought<'a>, &'a MemberSecretKey) -> Pending<'a, bool>,
    /// the grant of the member sought on the organization database, the organization id given,
    /// where one verifies under the format it starts from. The owner's signing key, where the
    /// member is the owner, judges their own certificate by its key alone.
    pub(crate) grant: GrantReader,
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

    /// A change that refuses nothing and writes nothing, starting from `from`, reading as the first
    /// change reads.
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
            ..TRANSITIONS[0]
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
