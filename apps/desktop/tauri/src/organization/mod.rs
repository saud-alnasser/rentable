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

    /// Every sub-concept's commands, where each declares them.
    const SOURCES: [&str; 8] = [
        include_str!("invitation/command.rs"),
        include_str!("mark/command.rs"),
        include_str!("member/command.rs"),
        include_str!("ownership/command.rs"),
        include_str!("role/command.rs"),
        include_str!("session/command.rs"),
        include_str!("setup/command.rs"),
        include_str!("workspace/command.rs"),
    ];

    /// The name a command is invoked by: its function name without `organization_`, since the
    /// plugin supplies it, as `build.rs` derives it for the ACL.
    fn invoked_as(function: &str) -> String {
        function
            .strip_prefix("organization_")
            .unwrap_or(function)
            .to_string()
    }

    /// The name every `#[tauri::command]` in a source file is invoked by, in order: the one its
    /// `rename = ".."` gives, or its function's where it has none.
    fn declared_commands(source: &str) -> Vec<String> {
        let lines: Vec<&str> = source.lines().collect();

        lines
            .iter()
            .enumerate()
            .filter_map(|(index, line)| {
                let attribute = line.trim().strip_prefix("#[tauri::command")?;

                if let Some(renamed) = attribute.strip_prefix("(rename = \"") {
                    return Some(renamed.split('"').next()?.to_string());
                }

                if attribute != "]" {
                    return None;
                }

                let signature = lines.get(index + 1)?.trim();
                // a command that takes the credential store is `pub(crate)`, because the store's
                // trait is private to the crate ([[rules/credentials]]).
                let name = signature
                    .strip_prefix("pub async fn ")
                    .or_else(|| signature.strip_prefix("pub(crate) async fn "))
                    .or_else(|| signature.strip_prefix("pub fn "))?;

                Some(invoked_as(name.split('(').next()?))
            })
            .collect()
    }

    /// Every command the plugin registers: each `super::<sub-concept>::<name>` in its handler, by
    /// the name it is invoked by.
    fn registered_commands(source: &str) -> Vec<String> {
        let handlers = source
            .split("tauri::generate_handler![")
            .nth(1)
            .and_then(|rest| rest.split(']').next())
            .expect("the organization plugin registers no handlers");

        handlers
            .split(',')
            .filter_map(|entry| entry.trim().strip_prefix("super::"))
            .filter_map(|path| path.rsplit("::").next())
            .map(invoked_as)
            .collect()
    }

    /// The commands that name no gate, and the gates that name no command.
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

    /// **Criterion 1, the Rust half.** Every command this module declares, and every one its
    /// plugin registers, names its gate here; a command with none fails, naming it,
    /// and so does a gate for a command that is gone. The flags named are the vocabulary's own,
    /// so each is a bit a refusal names.
    #[test]
    fn every_organization_command_names_its_gate() {
        let declared = declared_commands(&SOURCES.concat());
        let registered = registered_commands(include_str!("plugin.rs"));

        assert!(
            declared.len() > 40,
            "the declarations were not read: {declared:?}"
        );
        assert_eq!(
            {
                let mut sorted = registered.clone();
                sorted.sort();
                sorted
            },
            {
                let mut sorted = declared.clone();
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
