//! what a member may do, as the bits `packages/workspace-permission` names.
//!
//! **The package is the vocabulary and this is its value here.** Every flag on the bit the
//! package gives it, the families an editor groups them by, the owner's flags, the three roles
//! every organization has, and the one computation of a member's permissions: their role's mask
//! exclusive-or'd with their override (effort 838, requirements 1, 2, 3 and 6). The desktop names
//! the same flags because a command has to refuse a caller before it acts, and the refusal has to
//! be the same one the interface and the package would make. A test reads the package's own source
//! and fails if a name, a bit, a family or a role's default drifts from what is written there, and
//! a second reads the table of cases the package's own test reads, which is the only thing that
//! holds two copies of one vocabulary together.
//!
//! **Today's seven acts keep their own type while the callers move.** [`Administration`] is the
//! seven under today's names, `ChangeRole` included, on the same bits as the [`Flag`]s they are;
//! every routine here takes either through [`Act`]. Until the owner's flags are read from a row,
//! they are refused by asking whether the session is the owner's, in `workspace::require_owner`
//! and in `removal::remove_member`, and the refusal names the owner.
//!
//! **One act is gated by role instead, and signed.** Setting or removing the organization's mark,
//! the signature or seal its pages print (effort 835), is the owner's or an administrator's:
//! `mark::require_administrator` reads the role on the verified row, and the row it writes is
//! signed under the setter's certificate. [`Flag::ManageMark`] is the bit that replaces it.
//!
//! **Enforcement is by what the vault holds, and this is the arithmetic beside it.** A member's
//! permissions are on their verified row and travel in the session; a command asks
//! [`permits`] of that number. What a member can actually reach, a credential, is what their
//! vault unsealed, and no number here hands anybody a credential they do not hold.

use crate::{
    error::{Error, RefusalReason},
    sync::turso::platform::AccessLevel,
};

/// Anything a gate or a mask may name: a [`Flag`], or one of today's names for one.
pub trait Act: Copy {
    /// The bit the act sits on.
    fn bit_index(self) -> u32;

    /// The package's own spelling of the act, which is what a refusal names.
    fn name(self) -> &'static str;
}

/// One flag, on the bit the package's `FLAGS` gives it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Flag {
    InviteMember = 0,
    RemoveMember = 1,
    AssignRole = 2,
    RenameWorkspace = 3,
    ResetPassword = 4,
    RenameMember = 5,
    GrantWorkspace = 6,
    ManageRoles = 7,
    OverrideMember = 8,
    ManageMark = 9,
    CreateWorkspace = 10,
    DeleteWorkspace = 11,
    MintReadOnly = 12,
    LockOut = 13,
    RenewCredentials = 14,
    TursoAccount = 15,
    TransferOwnership = 16,
    DeleteOrganization = 17,
    ViewComplex = 20,
    CreateComplex = 21,
    EditComplex = 22,
    DeleteComplex = 23,
    ViewUnit = 24,
    CreateUnit = 25,
    EditUnit = 26,
    DeleteUnit = 27,
    ViewTenant = 28,
    CreateTenant = 29,
    EditTenant = 30,
    DeleteTenant = 31,
    ViewContract = 32,
    CreateContract = 33,
    EditContract = 34,
    DeleteContract = 35,
    ViewPayment = 36,
    CreatePayment = 37,
    EditPayment = 38,
    DeletePayment = 39,
}

/// A family of flags, as the package's `FAMILIES` groups them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Family {
    Administration,
    Owner,
    Complex,
    Unit,
    Tenant,
    Contract,
    Payment,
}

impl Family {
    /// Every family, in the package's order.
    pub const ALL: [Self; 7] = [
        Self::Administration,
        Self::Owner,
        Self::Complex,
        Self::Unit,
        Self::Tenant,
        Self::Contract,
        Self::Payment,
    ];

    /// The package's key for the family.
    pub fn name(self) -> &'static str {
        match self {
            Self::Administration => "administration",
            Self::Owner => "owner",
            Self::Complex => "complex",
            Self::Unit => "unit",
            Self::Tenant => "tenant",
            Self::Contract => "contract",
            Self::Payment => "payment",
        }
    }

    /// The family's flags, in bit order.
    pub fn flags(self) -> Vec<Flag> {
        Flag::ALL
            .into_iter()
            .filter(|flag| flag.family() == self)
            .collect()
    }
}

impl Flag {
    /// Every flag, in bit order. Bits 18, 19 and 40 to 52 are free.
    pub const ALL: [Self; 38] = [
        Self::InviteMember,
        Self::RemoveMember,
        Self::AssignRole,
        Self::RenameWorkspace,
        Self::ResetPassword,
        Self::RenameMember,
        Self::GrantWorkspace,
        Self::ManageRoles,
        Self::OverrideMember,
        Self::ManageMark,
        Self::CreateWorkspace,
        Self::DeleteWorkspace,
        Self::MintReadOnly,
        Self::LockOut,
        Self::RenewCredentials,
        Self::TursoAccount,
        Self::TransferOwnership,
        Self::DeleteOrganization,
        Self::ViewComplex,
        Self::CreateComplex,
        Self::EditComplex,
        Self::DeleteComplex,
        Self::ViewUnit,
        Self::CreateUnit,
        Self::EditUnit,
        Self::DeleteUnit,
        Self::ViewTenant,
        Self::CreateTenant,
        Self::EditTenant,
        Self::DeleteTenant,
        Self::ViewContract,
        Self::CreateContract,
        Self::EditContract,
        Self::DeleteContract,
        Self::ViewPayment,
        Self::CreatePayment,
        Self::EditPayment,
        Self::DeletePayment,
    ];

    /// The package's own spelling of the flag.
    pub fn name(self) -> &'static str {
        match self {
            Self::InviteMember => "inviteMember",
            Self::RemoveMember => "removeMember",
            Self::AssignRole => "assignRole",
            Self::RenameWorkspace => "renameWorkspace",
            Self::ResetPassword => "resetPassword",
            Self::RenameMember => "renameMember",
            Self::GrantWorkspace => "grantWorkspace",
            Self::ManageRoles => "manageRoles",
            Self::OverrideMember => "overrideMember",
            Self::ManageMark => "manageMark",
            Self::CreateWorkspace => "createWorkspace",
            Self::DeleteWorkspace => "deleteWorkspace",
            Self::MintReadOnly => "mintReadOnly",
            Self::LockOut => "lockOut",
            Self::RenewCredentials => "renewCredentials",
            Self::TursoAccount => "tursoAccount",
            Self::TransferOwnership => "transferOwnership",
            Self::DeleteOrganization => "deleteOrganization",
            Self::ViewComplex => "viewComplex",
            Self::CreateComplex => "createComplex",
            Self::EditComplex => "editComplex",
            Self::DeleteComplex => "deleteComplex",
            Self::ViewUnit => "viewUnit",
            Self::CreateUnit => "createUnit",
            Self::EditUnit => "editUnit",
            Self::DeleteUnit => "deleteUnit",
            Self::ViewTenant => "viewTenant",
            Self::CreateTenant => "createTenant",
            Self::EditTenant => "editTenant",
            Self::DeleteTenant => "deleteTenant",
            Self::ViewContract => "viewContract",
            Self::CreateContract => "createContract",
            Self::EditContract => "editContract",
            Self::DeleteContract => "deleteContract",
            Self::ViewPayment => "viewPayment",
            Self::CreatePayment => "createPayment",
            Self::EditPayment => "editPayment",
            Self::DeletePayment => "deletePayment",
        }
    }

    /// The family the flag is listed under. The bit decides it: administration below 10, the
    /// owner's below 18, and from 20 one run of four per record kind.
    pub fn family(self) -> Family {
        match self as u32 {
            0..=9 => Family::Administration,
            10..=17 => Family::Owner,
            20..=23 => Family::Complex,
            24..=27 => Family::Unit,
            28..=31 => Family::Tenant,
            32..=35 => Family::Contract,
            _ => Family::Payment,
        }
    }
}

impl Act for Flag {
    fn bit_index(self) -> u32 {
        self as u32
    }

    fn name(self) -> &'static str {
        Flag::name(self)
    }
}

/// The flags only the owner holds (requirement 2): no role and no override carries one.
pub const OWNER_ONLY: [Flag; 8] = [
    Flag::CreateWorkspace,
    Flag::DeleteWorkspace,
    Flag::MintReadOnly,
    Flag::LockOut,
    Flag::RenewCredentials,
    Flag::TursoAccount,
    Flag::TransferOwnership,
    Flag::DeleteOrganization,
];

/// The six flags that make a member a signer of member rows.
pub const MEMBER_ADMINISTRATION: [Flag; 6] = [
    Flag::InviteMember,
    Flag::RemoveMember,
    Flag::AssignRole,
    Flag::OverrideMember,
    Flag::RenameMember,
    Flag::ResetPassword,
];

/// Creating, editing and deleting every record kind: what a read-only grant takes away.
pub const WRITE_FLAGS: [Flag; 15] = [
    Flag::CreateComplex,
    Flag::EditComplex,
    Flag::DeleteComplex,
    Flag::CreateUnit,
    Flag::EditUnit,
    Flag::DeleteUnit,
    Flag::CreateTenant,
    Flag::EditTenant,
    Flag::DeleteTenant,
    Flag::CreateContract,
    Flag::EditContract,
    Flag::DeleteContract,
    Flag::CreatePayment,
    Flag::EditPayment,
    Flag::DeletePayment,
];

/// One act of administration under today's name, on the bit the package gives it.
///
/// **Kept so no caller moves while the vocabulary does.** `ChangeRole` is
/// [`Flag::AssignRole`] under the name the callers and their refusals still spell.
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

    /// The flag the act is.
    pub fn flag(self) -> Flag {
        match self {
            Self::InviteMember => Flag::InviteMember,
            Self::RemoveMember => Flag::RemoveMember,
            Self::ChangeRole => Flag::AssignRole,
            Self::RenameWorkspace => Flag::RenameWorkspace,
            Self::ResetPassword => Flag::ResetPassword,
            Self::RenameMember => Flag::RenameMember,
            Self::GrantWorkspace => Flag::GrantWorkspace,
        }
    }
}

impl Act for Administration {
    fn bit_index(self) -> u32 {
        self.flag() as u32
    }

    fn name(self) -> &'static str {
        Administration::name(self)
    }
}

pub const OWNER: &str = "owner";
pub const MANAGER: &str = "manager";
pub const ADMINISTRATOR: &str = "administrator";
pub const MEMBER: &str = "member";
/// A member who was removed. The row stays, signed by whoever removed them, so a machine holding
/// a stale replica sees a verified removal rather than an unexplained absence; it administers
/// nothing, signs in to nothing, and the dashboard does not list it.
pub const REMOVED: &str = "removed";

/// One of the three roles every organization has, as the package's `BUILT_IN` gives it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BuiltIn {
    pub id: &'static str,
    pub rank: i64,
    pub mask: i64,
}

const fn mask_of_flags(flags: &[Flag]) -> i64 {
    let mut mask = 0;
    let mut index = 0;

    while index < flags.len() {
        mask |= 1_i64 << (flags[index] as i64);
        index += 1;
    }

    mask
}

/// Every flag, and its mask never edited.
pub const OWNER_ROLE: BuiltIn = BuiltIn {
    id: OWNER,
    rank: 2_000_000,
    mask: mask_of_flags(&Flag::ALL),
};

/// Every flag but the owner's.
pub const MANAGER_ROLE: BuiltIn = BuiltIn {
    id: MANAGER,
    rank: 1_000_000,
    mask: mask_of_flags(&Flag::ALL) & !mask_of_flags(&OWNER_ONLY),
};

/// Viewing every record kind, and creating and editing records; no deleting and no
/// administration.
pub const MEMBER_ROLE: BuiltIn = BuiltIn {
    id: MEMBER,
    rank: 0,
    mask: mask_of_flags(&[
        Flag::ViewComplex,
        Flag::CreateComplex,
        Flag::EditComplex,
        Flag::ViewUnit,
        Flag::CreateUnit,
        Flag::EditUnit,
        Flag::ViewTenant,
        Flag::CreateTenant,
        Flag::EditTenant,
        Flag::ViewContract,
        Flag::CreateContract,
        Flag::EditContract,
        Flag::ViewPayment,
        Flag::CreatePayment,
        Flag::EditPayment,
    ]),
};

/// The three roles, highest rank first. A custom role ranks strictly between the member and the
/// manager.
pub const BUILT_IN: [BuiltIn; 3] = [OWNER_ROLE, MANAGER_ROLE, MEMBER_ROLE];

/// A member's permissions: their role's mask with every flag their override names switched
/// (requirement 6). The one computation, held to the package's `effective` by the table of cases
/// both read.
pub fn effective(role_mask: i64, override_mask: i64) -> i64 {
    role_mask ^ override_mask
}

/// A member's permissions inside one workspace. A read-only grant clears every flag in
/// [`WRITE_FLAGS`], whatever the role and the override say.
pub fn effective_in(permissions: i64, access: AccessLevel) -> i64 {
    match access {
        AccessLevel::FullAccess => permissions,
        AccessLevel::ReadOnly => permissions & !mask_of(&WRITE_FLAGS),
    }
}

/// The mask a role is created with, as `ADMINISTRATION_BY_ROLE` gives it. The role is what a
/// member is called; the column is what they may do, and a row may carry more or less.
///
/// **The owner and the administrator read alike**, because every act that separates them is one
/// [`Administration`] does not hold. What refuses an administrator a create, a delete, a mint, a
/// lock-out or a renewal is the owner check beside the command, never a bit missing here.
pub fn mask_of_role(role: &str) -> i64 {
    match role {
        OWNER | ADMINISTRATOR => mask_of(&Administration::ALL),
        _ => 0,
    }
}

/// How high a member row stands, from the role it names: what a certificate has to outrank to
/// sign the row (`authority::covers`).
///
/// **Read off the word until the row carries its role's id** (effort 838, ticket 04): the owner at
/// the owner's rank, a manager or an administrator at the manager's, and anybody else, a removed
/// member included, at the member's.
pub fn rank_of_role(role: &str) -> i64 {
    match role {
        OWNER => OWNER_ROLE.rank,
        MANAGER | ADMINISTRATOR => MANAGER_ROLE.rank,
        _ => MEMBER_ROLE.rank,
    }
}

/// The ceiling a certificate issued from a row carries: what the member may sign for.
///
/// **The row's own permissions, and the mark for an administrator**, until the row carries a role
/// id and an override (effort 838, ticket 04) and the ceiling becomes the effective value. The
/// owner's is every flag. The mark is added because setting it is an administrator's today by
/// role rather than by a bit on the row, and a certificate without it could not sign the mark it
/// sets.
pub fn ceiling_of_row(role: &str, permissions: i64) -> i64 {
    match role {
        OWNER => OWNER_ROLE.mask,
        ADMINISTRATOR => permissions | mask_of(&[Flag::ManageMark]),
        _ => permissions,
    }
}

pub fn mask_of<A: Act>(acts: &[A]) -> i64 {
    acts.iter()
        .fold(0, |mask, act| mask | (1_i64 << act.bit_index()))
}

/// Whether a stored permission value carries one act.
pub fn permits<A: Act>(permissions: i64, act: A) -> bool {
    permissions & (1_i64 << act.bit_index()) != 0
}

/// The refusal a command makes for a member whose row does not carry the act.
pub fn require<A: Act>(permissions: i64, act: A) -> Result<(), Error> {
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
pub fn require_any<A: Act>(permissions: i64, acts: &[A]) -> Result<(), Error> {
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
    use super::{
        ADMINISTRATOR, Administration, BUILT_IN, BuiltIn, Family, Flag, MANAGER_ROLE, MEMBER,
        MEMBER_ADMINISTRATION, MEMBER_ROLE, OWNER, OWNER_ONLY, OWNER_ROLE, WRITE_FLAGS, effective,
        effective_in, mask_of, mask_of_role, permits, require,
    };
    use crate::sync::turso::platform::AccessLevel;

    /// A file of the package, read rather than imported: this crate cannot import TypeScript, and
    /// two tables of one vocabulary are held together by nothing but this.
    fn package_file(name: &str) -> String {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/workspace-permission")
            .join(name);

        std::fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("cannot read {}: {error}", path.display()))
    }

    fn package_source() -> String {
        package_file("index.ts")
    }

    /// The text between `start` and the first `end` after it.
    fn block<'a>(source: &'a str, start: &str, end: &str) -> &'a str {
        source
            .split(start)
            .nth(1)
            .and_then(|rest| rest.split(end).next())
            .unwrap_or_else(|| panic!("the package has no `{start}`"))
    }

    /// Every single-quoted name in a stretch of source, in order.
    fn quoted(text: &str) -> Vec<&str> {
        text.split('\'').skip(1).step_by(2).collect()
    }

    fn names(flags: &[Flag]) -> Vec<&'static str> {
        flags.iter().map(|flag| flag.name()).collect()
    }

    #[test]
    fn every_flag_sits_on_the_bit_the_package_gives_it_and_the_package_names_no_others() {
        let source = package_source();
        let mut declared: Vec<(&str, i64)> =
            block(&source, "export const FLAGS = {", "} as const;")
                .lines()
                .filter_map(|line| {
                    let (name, bit) = line.trim().trim_end_matches(',').split_once(':')?;

                    Some((name.trim(), bit.trim().parse().ok()?))
                })
                .collect();

        declared.sort_by_key(|(_, bit)| *bit);

        let ours: Vec<(&str, i64)> = Flag::ALL
            .iter()
            .map(|flag| (flag.name(), *flag as i64))
            .collect();

        assert_eq!(
            ours, declared,
            "the package and this crate disagree about the flags"
        );
        assert!(
            Flag::ALL.iter().all(|flag| (*flag as i64) < 53),
            "a flag at bit 53 or above rounds the low-order bits away in the package"
        );
    }

    /// Today's seven names, each on the bit of the flag it is. `changeRole` is `assignRole`.
    #[test]
    fn each_of_todays_acts_is_the_flag_the_package_aliases_it_to() {
        let source = package_source();
        let declared: Vec<(&str, &str)> =
            block(&source, "export const ADMINISTRATION = {", "} as const;")
                .lines()
                .filter_map(|line| {
                    let (name, flag) = line.trim().trim_end_matches(',').split_once(':')?;

                    Some((name.trim(), flag.trim().strip_prefix("FLAGS.")?))
                })
                .collect();

        let ours: Vec<(&str, &str)> = Administration::ALL
            .iter()
            .map(|act| (act.name(), act.flag().name()))
            .collect();

        assert_eq!(
            ours, declared,
            "the package and this crate disagree about today's acts"
        );

        for act in Administration::ALL {
            assert_eq!(act as i64, act.flag() as i64, "{} moved", act.name());
        }

        assert_eq!(
            mask_of(&[Administration::ChangeRole]),
            mask_of(&[Flag::AssignRole])
        );
    }

    #[test]
    fn each_family_holds_the_flags_the_package_groups_under_it() {
        let source = package_source();
        let families = block(&source, "export const FAMILIES = {", "} as const");
        let declared: Vec<(&str, Vec<&str>)> = families
            .split(']')
            .filter_map(|entry| {
                let (key, list) = entry.split_once(':')?;
                let key = key.trim().trim_start_matches(',').trim();

                Some((key, quoted(list)))
            })
            .collect();

        let ours: Vec<(&str, Vec<&str>)> = Family::ALL
            .iter()
            .map(|family| (family.name(), names(&family.flags())))
            .collect();

        assert_eq!(
            ours, declared,
            "the package and this crate disagree about the families"
        );
    }

    #[test]
    fn the_owners_flags_the_member_administration_and_the_write_flags_are_the_packages() {
        let source = package_source();

        assert!(
            source.contains("export const OWNER_ONLY: readonly Flag[] = FAMILIES.owner;"),
            "the package's owner-only flags are no longer its owner family"
        );
        assert_eq!(names(&OWNER_ONLY), names(&Family::Owner.flags()));

        assert_eq!(
            names(&MEMBER_ADMINISTRATION),
            quoted(block(
                &source,
                "export const MEMBER_ADMINISTRATION: readonly Flag[] = [",
                "];"
            )),
            "the package and this crate disagree about the member administration"
        );
        assert_eq!(
            names(&WRITE_FLAGS),
            quoted(block(
                &source,
                "export const WRITE_FLAGS: readonly Flag[] = [",
                "];"
            )),
            "the package and this crate disagree about the write flags"
        );
    }

    /// Each built-in role's id, rank and default mask, as the package writes them.
    ///
    /// **The masks are read as the expressions they are written in**, where the ids and ranks are
    /// read as values: the owner's is every flag, the manager's every flag but the owner's, and the
    /// member's names its fifteen flags. The numbers are held by the shared table in the test
    /// below, so this test is about what each mask means and that one about what it comes to.
    #[test]
    fn each_built_in_role_carries_the_id_rank_and_mask_the_package_gives_it() {
        let source = package_source();
        let built_in = block(&source, "export const BUILT_IN = {", "} as const satisfies");
        let role = |key: &str| -> String {
            built_in
                .split(&format!("\t{key}: {{"))
                .nth(1)
                .and_then(|rest| rest.split("\n\t}").next())
                .unwrap_or_else(|| panic!("the package's BUILT_IN has no {key}"))
                .to_string()
        };
        let id_and_rank = |text: &str| -> (String, i64) {
            let id = quoted(block(text, "id:", ","))[0].to_string();
            let rank = block(text, "rank:", ",").trim().replace('_', "");

            (id, rank.parse().expect("a rank"))
        };

        let owner = role("owner");
        let manager = role("manager");
        let member = role("member");

        for (text, ours) in [
            (&owner, OWNER_ROLE),
            (&manager, MANAGER_ROLE),
            (&member, MEMBER_ROLE),
        ] {
            assert_eq!(
                id_and_rank(text),
                (ours.id.to_string(), ours.rank),
                "the package and this crate disagree about the {} role",
                ours.id
            );
        }

        assert!(
            owner.contains("mask: maskOf(...EVERY_FLAG)"),
            "the owner no longer carries every flag in the package"
        );
        assert_eq!(OWNER_ROLE.mask, mask_of(&Flag::ALL));

        assert!(
            manager.contains(
                "mask: maskOf(...EVERY_FLAG.filter((flag) => !OWNER_ONLY.includes(flag)))"
            ),
            "the manager no longer carries every flag but the owner's in the package"
        );
        assert_eq!(
            MANAGER_ROLE.mask,
            mask_of(
                &Flag::ALL
                    .into_iter()
                    .filter(|flag| !OWNER_ONLY.contains(flag))
                    .collect::<Vec<_>>()
            )
        );

        let members: Vec<&str> = Flag::ALL
            .into_iter()
            .filter(|flag| permits(MEMBER_ROLE.mask, *flag))
            .map(Flag::name)
            .collect();

        assert_eq!(
            members,
            quoted(block(&member, "maskOf(", ")")),
            "the package and this crate disagree about what a member carries"
        );

        assert_eq!(BUILT_IN, [OWNER_ROLE, MANAGER_ROLE, MEMBER_ROLE]);
    }

    /// The table of cases the package's `tests/effective.test.ts` reads too (criteria 6 and 8).
    fn shared_table() -> serde_json::Value {
        serde_json::from_str(&package_file("tests/effective.json"))
            .expect("the shared table is JSON")
    }

    fn number(value: &serde_json::Value, key: &str) -> i64 {
        value[key]
            .as_i64()
            .unwrap_or_else(|| panic!("{key} is not an integer in {value}"))
    }

    #[test]
    fn the_built_in_roles_are_the_ones_the_shared_table_holds() {
        let table = shared_table();

        for ours in BUILT_IN {
            let theirs = &table["builtIn"][ours.id];

            assert_eq!(
                BuiltIn {
                    id: ours.id,
                    rank: number(theirs, "rank"),
                    mask: number(theirs, "mask"),
                },
                ours,
                "the shared table and this crate disagree about the {} role",
                ours.id
            );
            assert_eq!(theirs["id"].as_str(), Some(ours.id));
        }
    }

    #[test]
    fn every_case_in_the_shared_table_reads_the_effective_permissions_it_names() {
        let table = shared_table();
        let cases = table["cases"].as_array().expect("the shared table's cases");

        assert!(!cases.is_empty(), "the shared table holds no cases");

        for case in cases {
            let expected = number(case, "effective");

            assert_eq!(
                effective(number(case, "mask"), number(case, "override")),
                expected,
                "{case}"
            );
            assert_eq!(effective_in(expected, AccessLevel::FullAccess), expected);
            assert_eq!(
                effective_in(expected, AccessLevel::ReadOnly),
                number(case, "readOnly"),
                "{case}, read-only"
            );
        }
    }

    #[test]
    fn an_override_turns_a_flag_off_where_the_role_carries_it_and_on_where_it_does_not() {
        let member = MEMBER_ROLE.mask;

        assert!(permits(member, Flag::EditPayment));
        assert!(!permits(
            effective(member, mask_of(&[Flag::EditPayment])),
            Flag::EditPayment
        ));

        assert!(!permits(member, Flag::DeletePayment));
        assert!(permits(
            effective(member, mask_of(&[Flag::DeletePayment])),
            Flag::DeletePayment
        ));

        let refusal = require(member, Flag::DeletePayment).expect_err("a member deleted a payment");

        assert!(refusal.to_string().contains("deletePayment"), "{refusal}");
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

    /// Criterion 12 of effort 826: every act against every role, iterating this crate's list of
    /// acts, which the tests above hold to the package's.
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
