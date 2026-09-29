//! an organization: its members, what each of them may do, and the credentials a
//! member's password unlocks.
//!
//! Two modules over bytes, and they are separate on purpose. The vault (`member/vault.rs`) is the
//! key schedule and answers whether a password opens something. The authority chain
//! (`authority/`) answers whether a row is telling the truth. Neither knows anything about rows,
//! about Turso, or about the organization it is for, and one module answering both
//! questions would let a reviewer check one and believe they had checked both.
//!
//! A third holds the rows. The store is the organization database as a replica on
//! this machine, its schema, and the queries over it; it seals nothing itself and
//! signs and verifies through the chain, so the two questions above still have one
//! answer each.

//! What follows the three is the work over them, one directory per sub-concept, each holding the
//! logic it owns and, in its `command.rs`, the commands the shell invokes on it (effort 840,
//! requirement 10): the first run and the Turso consent (`setup/`), the sign-in, the launch's
//! resume, the heartbeat and the forget that leaves nothing of the organization here (`session/`),
//! the accounts and the links a machine is admitted by (`invitation/`), a member's own row and
//! their removal (`member/`), the roles (`role/`), the handover (`ownership/`), the workspaces
//! (`workspace/`) and the lease their schema is brought up under (`lease/`), and the mark the
//! organization prints (`mark/`). What every command does first, acting as the signed-in member,
//! is `act.rs`. The commands are served as one plugin, `organization`, whose handler in `plugin.rs`
//! lists every sub-concept's: a command answers to its Rust name without `organization_`, so
//! `organization_member_rename` is invoked as `plugin:organization|member_rename`. What they read
//! is the plugin's state (`state.rs`), managed in its setup. The owner's
//! upgrade of an organization an earlier version made, which runs once, is not here: it is
//! `upgrade/format/`, with everything else that brings an older install forward, and the session
//! reaches it through a port it defines (`session::Upgrade`), so nothing here names it.

mod act;
pub mod authority;
pub mod invitation;
pub mod lease;
pub mod mark;
pub mod member;
pub mod ownership;
mod plugin;
pub mod role;
pub mod session;
pub mod setup;
mod state;
pub mod store;
pub mod workspace;

/// The one organization this machine holds, as this machine's record keeps it. Described with
/// the record (`machine`), which is what it is part of; named here, where the organization's own
/// code reads and writes it.
pub use crate::machine::HeldOrganization;

pub use plugin::plugin;
pub use state::Shared;

#[cfg(test)]
mod tests {
    use crate::organization::role::permission::Flag;

    // -------------------------------------------------------------------------------------
    // Effort 838, criterion 1: every organization command names its gate.
    // -------------------------------------------------------------------------------------

    /// What stands in front of an organization command before it does anything.
    ///
    /// **The flag is asked of the verified row by the act behind the command**, and never of the
    /// session's snapshot; this table is the list of which, so a command added without one is a
    /// test that fails rather than an act anybody may perform.
    #[derive(Clone, Copy, Debug)]
    enum Gate {
        /// before there is anybody to act as: the first run, a connect, a link, the wall.
        Public,
        /// this machine's own hold on the organization, which is its to let go of: a sign-out,
        /// a disconnect, the Turso consent it holds.
        ThisMachine,
        /// the signed-in member's own session or row, and nobody else's.
        Own,
        /// what every signed-in member reads.
        SignedIn,
        /// the flag, off the actor's verified row.
        Flag(Flag),
        /// any of the flags, off the actor's verified row.
        AnyFlag(&'static [Flag]),
        /// every one of the flags, off the actor's verified row: an act that writes a row a second
        /// flag signs, as making and resetting an account write its grant on the organization
        /// database, which is `grantWorkspace`'s (effort 838).
        AllFlags(&'static [Flag]),
        /// the owner's verified row, carrying the flag: the acts that need the Turso authority
        /// or hand the organization on (`session::Actor::require_owner`).
        Owner(Flag),
    }

    /// Every command the sub-concepts declare, with its gate.
    const GATES: &[(&str, Gate)] = &[
        ("setup_create", Gate::Public),
        ("setup_group_inspect", Gate::Public),
        ("setup_connect_existing", Gate::Public),
        ("session_state_get", Gate::Public),
        ("session_disconnect", Gate::ThisMachine),
        (
            "member_organization_delete",
            Gate::Owner(Flag::DeleteOrganization),
        ),
        ("session_sign_in", Gate::Public),
        ("session_sign_out", Gate::ThisMachine),
        ("workspace_create", Gate::Owner(Flag::CreateWorkspace)),
        ("workspace_grant", Gate::Flag(Flag::GrantWorkspace)),
        ("workspace_grant_withdraw", Gate::Flag(Flag::GrantWorkspace)),
        ("workspace_delete", Gate::Owner(Flag::DeleteWorkspace)),
        ("workspace_open", Gate::Own),
        (
            "workspace_renew_credentials",
            Gate::Owner(Flag::RenewCredentials),
        ),
        ("workspace_renew_due", Gate::Owner(Flag::RenewCredentials)),
        (
            "invitation_member_create",
            Gate::AllFlags(&[Flag::InviteMember, Flag::GrantWorkspace]),
        ),
        (
            "invitation_link_make",
            Gate::AnyFlag(&[Flag::InviteMember, Flag::ResetPassword]),
        ),
        (
            "invitation_password_unset",
            Gate::AllFlags(&[Flag::ResetPassword, Flag::GrantWorkspace]),
        ),
        ("invitation_accept", Gate::Public),
        ("invitation_machine_connect", Gate::Public),
        ("role_list", Gate::SignedIn),
        ("role_create", Gate::Flag(Flag::ManageRoles)),
        ("role_rename", Gate::Flag(Flag::ManageRoles)),
        ("role_set_mask", Gate::Flag(Flag::ManageRoles)),
        ("role_move", Gate::Flag(Flag::ManageRoles)),
        ("role_delete", Gate::Flag(Flag::ManageRoles)),
        // and `overrideMember` too, where the override given with the role is not the one the
        // member carries (`role::assign_role`).
        ("role_assign", Gate::Flag(Flag::AssignRole)),
        ("role_set_override", Gate::Flag(Flag::OverrideMember)),
        (
            "role_set_workspace_override",
            Gate::Flag(Flag::OverrideMember),
        ),
        ("ownership_offer", Gate::Owner(Flag::TransferOwnership)),
        (
            "ownership_withdraw_offer",
            Gate::Owner(Flag::TransferOwnership),
        ),
        ("ownership_accept", Gate::Own),
        ("member_rename", Gate::Flag(Flag::RenameMember)),
        ("mark_get", Gate::SignedIn),
        ("mark_set", Gate::Flag(Flag::ManageMark)),
        ("mark_clear", Gate::Flag(Flag::ManageMark)),
        ("session_end_elsewhere", Gate::Own),
        ("member_end_sessions", Gate::Flag(Flag::ResetPassword)),
        ("member_lock_out_cost", Gate::Flag(Flag::RemoveMember)),
        ("member_remove", Gate::Flag(Flag::RemoveMember)),
        (
            "setup_account_refusal_detail",
            Gate::Owner(Flag::TursoAccount),
        ),
        ("member_change_password", Gate::Own),
        ("member_list", Gate::SignedIn),
        ("member_standings", Gate::SignedIn),
        ("invitation_link_take", Gate::Public),
        ("invitation_link_read", Gate::Public),
        ("setup_reconnect_authority", Gate::ThisMachine),
        // the Turso consent this machine holds, which the setup walk asks for before there is
        // anybody to act as, and hands back.
        ("setup_consent_begin", Gate::ThisMachine),
        ("setup_consent_result", Gate::ThisMachine),
        ("setup_consent_disconnect", Gate::ThisMachine),
        // the heartbeat over this machine's own replicas; it asks nothing of a row, and a member
        // signed out elsewhere ends it before anything is pushed.
        ("session_replicate", Gate::ThisMachine),
        ("workspace_rename", Gate::Flag(Flag::RenameWorkspace)),
    ];

    /// The commands that name no gate, and the gates that name no command.
    /// Every command the sub-concepts declare, read off their source by walking `organization/`,
    /// so a command declared and left out of the plugin's handler is caught, whatever file it is in.
    fn declared_in_source() -> Vec<String> {
        fn walk(dir: &std::path::Path, found: &mut Vec<String>) {
            for entry in std::fs::read_dir(dir).expect("organization/ is readable") {
                let path = entry.expect("an entry").path();
                if path.is_dir() {
                    walk(&path, found);
                } else if path.extension().is_some_and(|extension| extension == "rs") {
                    let source = std::fs::read_to_string(&path).expect("a source file");
                    for line in source.lines() {
                        if let Some(renamed) = line
                            .trim()
                            .strip_prefix("#[tauri::command(rename = \"")
                            .and_then(|rest| rest.split('"').next())
                        {
                            found.push(renamed.to_string());
                        }
                    }
                }
            }
        }

        let mut found = Vec::new();
        walk(
            &std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/organization"),
            &mut found,
        );
        found
    }

    fn ungated(declared: &[String], gates: &[(&str, Gate)]) -> (Vec<String>, Vec<String>) {
        let named: Vec<&str> = gates.iter().map(|(name, _)| *name).collect();

        (
            declared
                .iter()
                .filter(|command| !named.contains(&command.as_str()))
                .cloned()
                .collect(),
            named
                .iter()
                .filter(|name| !declared.iter().any(|command| command == *name))
                .map(|name| name.to_string())
                .collect(),
        )
    }

    /// **Criterion 1, the Rust half.** Every command the organization plugin answers names its
    /// gate here; a command with none fails, naming it, and so does a gate for a command that is
    /// gone. The commands are the plugin's as `build.rs` derives them from its handler for the ACL
    /// (`guard/acl.rs`), so this reads the one list rather than a second parse of it. The flags
    /// named are the vocabulary's own, so each is a bit a refusal names.
    #[test]
    fn every_organization_command_names_its_gate() {
        let declared: Vec<String> = crate::guard::acl::plugin_in("organization")
            .commands
            .iter()
            .map(|command| command.to_string())
            .collect();

        assert!(
            declared.len() > 40,
            "the declarations were not read: {declared:?}"
        );
        assert_eq!(
            {
                let mut sorted = declared.clone();
                sorted.sort();
                sorted
            },
            {
                let mut sorted = declared_in_source();
                sorted.sort();
                sorted
            },
            "the plugin registers a different set of organization commands than the sub-concepts declare"
        );

        let (without, stale) = ungated(&declared, GATES);

        assert!(without.is_empty(), "commands with no gate: {without:?}");
        assert!(stale.is_empty(), "gates naming no command: {stale:?}");

        for (name, gate) in GATES {
            let flags: Vec<Flag> = match gate {
                Gate::Flag(flag) | Gate::Owner(flag) => vec![*flag],
                Gate::AnyFlag(flags) | Gate::AllFlags(flags) => flags.to_vec(),
                Gate::Public | Gate::ThisMachine | Gate::Own | Gate::SignedIn => Vec::new(),
            };

            for flag in flags {
                assert!(Flag::ALL.contains(&flag), "{name} names {}", flag.name());
            }

            if let Gate::Owner(flag) = gate {
                assert!(
                    crate::organization::role::permission::OWNER_ONLY.contains(flag),
                    "{name} is the owner's under {}, which is not one of the owner's flags",
                    flag.name()
                );
            }
        }

        // and the check itself: a command declared with no gate is named.
        let (without, _) = ungated(
            &["member_widen_everything".to_string()],
            &[("member_list", Gate::SignedIn)],
        );

        assert_eq!(without, vec!["member_widen_everything".to_string()]);
    }
}
