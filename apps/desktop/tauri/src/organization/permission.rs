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
//! **The owner's flags are asked of the owner's verified row**, by `workspace::require_owner` for
//! the workspace acts, the handover and the account, and the refusal names the owner. *The seven
//! acts of effort 826 kept a type of their own, `Administration`, and the role kept its word
//! `administrator` for the manager, until ticket 15 of effort 838 retired both.*
//!
//! **The organization's mark is [`Flag::ManageMark`]**, the signature or seal its pages print
//! (effort 835): `mark::set_mark` and `mark::clear_mark` ask it of the verified row, and the row
//! the first writes is signed under the setter's certificate, which covers it only where its
//! ceiling carries the flag.
//!
//! **Enforcement is by what the vault holds, and this is the arithmetic beside it.** A member's
//! permissions are on their verified row and travel in the session; a command asks
//! [`permits`] of that number. What a member can actually reach, a credential, is what their
//! vault unsealed, and no number here hands anybody a credential they do not hold.

use crate::{
    error::{Error, RefusalReason},
    sync::turso::platform::AccessLevel,
};

/// Anything a gate or a mask may name, which is a [`Flag`].
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

/// The owner's role, by id and by kind: the one role that is a constant rather than a row.
pub const OWNER: &str = "owner";
/// The manager's role, by id and by kind.
pub const MANAGER: &str = "manager";
/// The member's role, by id and by kind, which every member holds until given another.
pub const MEMBER: &str = "member";
/// The kind every role an organization adds carries; its id is drawn when it is made.
pub const CUSTOM: &str = "custom";

/// The four kinds a role is of, which is what a session and the machine's record call the role a
/// member holds (effort 838, the plan's *Interfaces*). A removed member is known by their row's
/// `removed_at`, never by a kind.
pub const KINDS: [&str; 4] = [OWNER, MANAGER, MEMBER, CUSTOM];

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

/// The first flag `given` carries that `held` does not, in bit order, by the package's name for
/// it; `None` where `held` covers every bit of `given`.
///
/// **Requirement 7's "only flags you hold"**, as a command asks it before it gives somebody a mask
/// (effort 838): what a member hands on is bounded by what they carry. A bit no flag sits on is
/// never held, so it is named as what it is rather than let through.
pub fn first_not_held(held: i64, given: i64) -> Option<&'static str> {
    let beyond = given & !held;

    if beyond == 0 {
        return None;
    }

    Some(
        Flag::ALL
            .iter()
            .find(|flag| permits(beyond, **flag))
            .map_or("a flag this version does not name", |flag| flag.name()),
    )
}

/// The first of the owner's flags a mask carries, by name: what no role and no override may hold
/// (requirement 2).
pub fn first_owner_only(mask: i64) -> Option<&'static str> {
    OWNER_ONLY
        .iter()
        .find(|flag| permits(mask, **flag))
        .map(|flag| flag.name())
}

#[cfg(test)]
mod tests {
    use super::{
        BUILT_IN, BuiltIn, Family, Flag, MANAGER, MANAGER_ROLE, MEMBER_ADMINISTRATION, MEMBER_ROLE,
        OWNER, OWNER_ONLY, OWNER_ROLE, WRITE_FLAGS, effective, effective_in, first_not_held,
        first_owner_only, mask_of, permits, require,
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

    /// Criterion 12 of effort 826, on effective permissions: every flag against every built-in
    /// role holding no override, iterating this crate's list of flags, which the tests above hold
    /// to the package's.
    ///
    /// **The owner is the only role holding the owner's flags.** The manager carries every other
    /// flag and the member no administration and no delete; what refuses the manager an owner's act
    /// is the flag missing here and, beside it, the owner check the tests in `workspace.rs` and
    /// `removal.rs` cover.
    #[test]
    fn every_flag_is_granted_or_withheld_by_role() {
        let expected = |role: &str, flag: Flag| match role {
            OWNER => true,
            MANAGER => !OWNER_ONLY.contains(&flag),
            _ => {
                flag.family() != Family::Administration
                    && flag.family() != Family::Owner
                    && !flag.name().starts_with("delete")
            }
        };

        for role in BUILT_IN {
            let permissions = effective(role.mask, 0);

            for flag in Flag::ALL {
                assert_eq!(
                    permits(permissions, flag),
                    expected(role.id, flag),
                    "{} and {}",
                    role.id,
                    flag.name()
                );
                assert_eq!(require(permissions, flag).is_ok(), expected(role.id, flag));
            }
        }

        let refusal = require(effective(MEMBER_ROLE.mask, 0), Flag::InviteMember)
            .expect_err("a member invited");

        assert!(refusal.to_string().contains("inviteMember"), "{refusal}");
    }

    /// Requirement 7's "only flags you hold", as the arithmetic a command asks it with: nothing
    /// beyond what is held names nothing, the first flag beyond it is named in bit order, a bit no
    /// flag sits on is named as unknown, and the owner's flags are found wherever they are set.
    #[test]
    fn a_mask_beyond_what_is_held_names_its_first_flag() {
        let held = MANAGER_ROLE.mask;

        assert_eq!(first_not_held(held, MEMBER_ROLE.mask), None);
        assert_eq!(first_not_held(held, 0), None);
        assert_eq!(
            first_not_held(held, mask_of(&[Flag::LockOut, Flag::DeleteOrganization])),
            Some("lockOut")
        );
        assert_eq!(
            first_not_held(
                MEMBER_ROLE.mask,
                mask_of(&[Flag::DeletePayment, Flag::InviteMember])
            ),
            Some("inviteMember")
        );
        assert_eq!(
            first_not_held(OWNER_ROLE.mask, 1_i64 << 45),
            Some("a flag this version does not name")
        );

        assert_eq!(first_owner_only(MANAGER_ROLE.mask), None);
        assert_eq!(
            first_owner_only(mask_of(&[Flag::ViewUnit, Flag::MintReadOnly])),
            Some("mintReadOnly")
        );
    }
}
