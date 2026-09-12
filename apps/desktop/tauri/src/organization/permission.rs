//! what a member may administer, as the bits `packages/workspace-permission` names.
//!
//! **The package is the vocabulary and this is its value here.** Six acts, six bits, and the
//! masks each role is created with; the desktop names the same six because a command has to
//! refuse a caller before it acts, and the refusal has to be the same one the interface and the
//! package would make. A test reads the package's own source and fails if the bit an act sits on
//! or the acts a role carries drift from what is written there, which is the only thing that
//! holds two copies of one table together.
//!
//! **Enforcement is by what the vault holds, and this is the arithmetic beside it.** A member's
//! permissions are on their verified row and travel in the session; a command asks
//! [`permits`] of that number. What a member can actually reach, a credential, is what their
//! vault unsealed, and no number here hands anybody a credential they do not hold.

use crate::error::Error;

/// One act of administration, on the bit the package gives it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Administration {
    InviteMember = 0,
    RemoveMember = 1,
    ChangeRole = 2,
    RenameWorkspace = 3,
    DeleteWorkspace = 4,
    TransferOwnership = 5,
}

impl Administration {
    /// Every act, in bit order.
    pub const ALL: [Self; 6] = [
        Self::InviteMember,
        Self::RemoveMember,
        Self::ChangeRole,
        Self::RenameWorkspace,
        Self::DeleteWorkspace,
        Self::TransferOwnership,
    ];

    /// The package's own spelling of the act, which is what a refusal names.
    pub fn name(self) -> &'static str {
        match self {
            Self::InviteMember => "inviteMember",
            Self::RemoveMember => "removeMember",
            Self::ChangeRole => "changeRole",
            Self::RenameWorkspace => "renameWorkspace",
            Self::DeleteWorkspace => "deleteWorkspace",
            Self::TransferOwnership => "transferOwnership",
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
pub fn mask_of_role(role: &str) -> i64 {
    match role {
        OWNER => mask_of(&Administration::ALL),
        ADMINISTRATOR => mask_of(&[
            Administration::InviteMember,
            Administration::RemoveMember,
            Administration::ChangeRole,
        ]),
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
        Err(Error::Forbidden {
            message: format!("your role does not include {}", act.name()),
        })
    }
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
            source.contains("administrator: maskOf('inviteMember', 'removeMember', 'changeRole')"),
            "the administrator's acts moved in the package"
        );
        assert!(
            source.contains("member: 0"),
            "a member carries something in the package"
        );

        assert_eq!(mask_of_role(OWNER), 0b11_1111);
        assert_eq!(mask_of_role(ADMINISTRATOR), 0b00_0111);
        assert_eq!(mask_of_role(MEMBER), 0);
        assert_eq!(mask_of_role("a role this build has never heard of"), 0);
    }

    /// Criterion 12: every act against every role, iterating this crate's list of acts, which the
    /// first test holds to the package's.
    #[test]
    fn every_act_is_granted_or_withheld_by_role() {
        let expected = |role: &str, act: Administration| {
            matches!(
                (role, act),
                (OWNER, _)
                    | (
                        ADMINISTRATOR,
                        Administration::InviteMember
                            | Administration::RemoveMember
                            | Administration::ChangeRole
                    )
            )
        };

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
