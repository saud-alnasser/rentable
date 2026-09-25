//! what a member may administer, as the bits `packages/workspace-permission` names.
//!
//! **The package is the vocabulary and this is its value here.** Seven acts, seven bits, and the
//! masks each role is created with; the desktop names the same seven because a command has to
//! refuse a caller before it acts, and the refusal has to be the same one the interface and the
//! package would make. A test reads the package's own source and fails if the bit an act sits on
//! or the acts a role carries drift from what is written there, which is the only thing that
//! holds two copies of one table together.
//!
//! **Six acts are missing from this table on purpose** (requirement 5 of effort 826): creating and
//! deleting a workspace, minting a read-only credential, locking a member out, renewing
//! credentials, and the Turso account and the organization's own link. Each needs the Turso
//! authority, which sits in one machine's keyring and in no row, so no bit here could deliver one.
//! They are refused by asking whether the session is the owner's, in `workspace::require_owner`
//! and in `removal::remove_member`, and the refusal names the owner.
//!
//! **One act is gated by role instead, and signed.** Setting or removing the organization's mark,
//! the signature or seal its pages print (effort 835), is the owner's or an administrator's:
//! `mark::require_administrator` reads the role on the verified row, and the row it writes is
//! signed under the setter's certificate. A bit here would have changed every signed row's mask
//! for an act both roles already share.
//!
//! **Enforcement is by what the vault holds, and this is the arithmetic beside it.** A member's
//! permissions are on their verified row and travel in the session; a command asks
//! [`permits`] of that number. What a member can actually reach, a credential, is what their
//! vault unsealed, and no number here hands anybody a credential they do not hold.

use crate::error::{Error, RefusalReason};

/// One act of administration, on the bit the package gives it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Administration {
    InviteMember = 0,
    RemoveMember = 1,
    ChangeRole = 2,
    RenameWorkspace = 3,
    ResetPassword = 4,
    RenameMember = 5,
    GrantWorkspace = 6,
}

impl Administration {
    /// Every act, in bit order.
    pub const ALL: [Self; 7] = [
        Self::InviteMember,
        Self::RemoveMember,
        Self::ChangeRole,
        Self::RenameWorkspace,
        Self::ResetPassword,
        Self::RenameMember,
        Self::GrantWorkspace,
    ];

    /// The package's own spelling of the act, which is what a refusal names.
    pub fn name(self) -> &'static str {
        match self {
            Self::InviteMember => "inviteMember",
            Self::RemoveMember => "removeMember",
            Self::ChangeRole => "changeRole",
            Self::RenameWorkspace => "renameWorkspace",
            Self::ResetPassword => "resetPassword",
            Self::RenameMember => "renameMember",
            Self::GrantWorkspace => "grantWorkspace",
        }
    }

    fn bit(self) -> i64 {
        1_i64 << (self as i64)
    }
}

pub const OWNER: &str = "owner";
pub const ADMINISTRATOR: &str = "administrator";
pub const MEMBER: &str = "member";
/// A member who was removed. The row stays, signed by whoever removed them, so a machine holding
/// a stale replica sees a verified removal rather than an unexplained absence; it administers
/// nothing, signs in to nothing, and the dashboard does not list it.
pub const REMOVED: &str = "removed";

/// The mask a role is created with, as `ADMINISTRATION_BY_ROLE` gives it. The role is what a
/// member is called; the column is what they may do, and a row may carry more or less.
///
/// **The owner and the administrator read alike**, because every act that separates them is one
/// the table above does not hold. What refuses an administrator a create, a delete, a mint, a
/// lock-out or a renewal is the owner check beside the command, never a bit missing here.
pub fn mask_of_role(role: &str) -> i64 {
    match role {
        OWNER | ADMINISTRATOR => mask_of(&Administration::ALL),
        _ => 0,
    }
}

pub fn mask_of(acts: &[Administration]) -> i64 {
    acts.iter().fold(0, |mask, act| mask | act.bit())
}

/// Whether a stored permission value carries one act.
pub fn permits(permissions: i64, act: Administration) -> bool {
    permissions & act.bit() != 0
}

/// The refusal a command makes for a member whose row does not carry the act.
pub fn require(permissions: i64, act: Administration) -> Result<(), Error> {
    if permits(permissions, act) {
        Ok(())
    } else {
        Err(Error::refused(
            RefusalReason::RoleLacksAct,
            format!("your role does not include {}", act.name()),
        ))
    }
}

/// The refusal a command makes for a member whose row carries none of the acts named.
///
/// **Any of them, where [`require`] is every one of them.** A command asks for this where two acts
/// each carry the same authority over the same thing, rather than where one act is two things: the
/// one link act is `inviteMember`'s or `resetPassword`'s, because a person trusted to take an
/// account's password away is trusted to hand back the link that restores it, and the alternative
/// is a holder of the second who can lock somebody out and cannot let them back in (effort 828,
/// the spec's Risks, struck on the human's word on 2026-09-16).
///
/// The sentence names every act that would have done, because a caller told only the first would
/// go looking for a bit they do not need.
pub fn require_any(permissions: i64, acts: &[Administration]) -> Result<(), Error> {
    if acts.iter().any(|act| permits(permissions, *act)) {
        return Ok(());
    }

    let named: Vec<&str> = acts.iter().map(|act| act.name()).collect();

    Err(Error::refused(
        RefusalReason::RoleLacksAct,
        format!("your role does not include {}", named.join(" or ")),
    ))
}

#[cfg(test)]
mod tests {
    use super::{ADMINISTRATOR, Administration, MEMBER, OWNER, mask_of_role, permits, require};

    /// The package's source, read rather than imported: this crate cannot import TypeScript, and
    /// two tables of one vocabulary are held together by nothing but this.
    fn package_source() -> String {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/workspace-permission/index.ts");

        std::fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("cannot read {}: {error}", path.display()))
    }

    #[test]
    fn every_act_sits_on_the_bit_the_package_gives_it_and_the_package_names_no_others() {
        let source = package_source();
        let table = source
            .split("export const ADMINISTRATION = {")
            .nth(1)
            .and_then(|rest| rest.split("} as const;").next())
            .expect("the ADMINISTRATION table");
        let mut declared: Vec<(&str, i64)> = table
            .lines()
            .filter_map(|line| {
                let (name, bit) = line.trim().trim_end_matches(',').split_once(':')?;

                Some((name.trim(), bit.trim().parse().ok()?))
            })
            .collect();

        declared.sort_by_key(|(_, bit)| *bit);

        let ours: Vec<(&str, i64)> = Administration::ALL
            .iter()
            .map(|act| (act.name(), *act as i64))
            .collect();

        assert_eq!(
            ours, declared,
            "the package and this crate disagree about the acts"
        );
    }

    #[test]
    fn each_role_carries_the_acts_the_package_gives_it() {
        let source = package_source();

        assert!(
            source.contains("owner: maskOf(...EVERY_ADMINISTRATION)"),
            "the owner no longer carries every act in the package"
        );
        assert!(
            source.contains("administrator: maskOf(...EVERY_ADMINISTRATION)"),
            "the administrator no longer carries every grantable act in the package"
        );
        assert!(
            source.contains("member: 0"),
            "a member carries something in the package"
        );

        assert_eq!(mask_of_role(OWNER), 0b111_1111);
        assert_eq!(mask_of_role(ADMINISTRATOR), 0b111_1111);
        assert_eq!(mask_of_role(MEMBER), 0);
        assert_eq!(mask_of_role("a role this build has never heard of"), 0);
    }

    /// Criterion 12: every act against every role, iterating this crate's list of acts, which the
    /// first test holds to the package's.
    ///
    /// **A member is the only role this table withholds anything from.** The acts an administrator
    /// may not perform are the ones requirement 5 keeps out of the table, and they are refused by
    /// the owner check rather than here, which is what the tests in `workspace.rs` and `removal.rs`
    /// cover with an administrator holding all seven bits.
    #[test]
    fn every_act_is_granted_or_withheld_by_role() {
        let expected = |role: &str, _act: Administration| matches!(role, OWNER | ADMINISTRATOR);

        for role in [OWNER, ADMINISTRATOR, MEMBER] {
            for act in Administration::ALL {
                assert_eq!(
                    permits(mask_of_role(role), act),
                    expected(role, act),
                    "{role} and {}",
                    act.name()
                );
                assert_eq!(
                    require(mask_of_role(role), act).is_ok(),
                    expected(role, act)
                );
            }
        }

        let refusal = require(mask_of_role(MEMBER), Administration::InviteMember)
            .expect_err("a member invited");

        assert!(refusal.to_string().contains("inviteMember"), "{refusal}");
    }
}
