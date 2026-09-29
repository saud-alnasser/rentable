use tauri::plugin::{Builder, TauriPlugin};

/// the organization's commands, every sub-concept's in one handler: each is declared in its
/// sub-concept's `command.rs` and answers to its Rust name without `organization_`, so
/// `organization_member_rename` is invoked as `plugin:organization|member_rename`.
///
/// It runs no setup and manages no state of its own. What its commands read is the application
/// state the app's `.setup` builds, the organization and the member held there beside the
/// database and this machine's record, which the `sync` plugin's commands read too; it is made
/// after every plugin's setup has run, and a command reads it when it is called, which is after
/// that. For the same reason a link the launch hands over is received in the app's `.setup` and
/// not here (`invitation/arrival.rs`): a plugin's setup runs before any window exists.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep, and the gate test in `mod.rs` reads it to
/// hold every command it lists to a gate.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("organization")
        .invoke_handler(tauri::generate_handler![
            super::setup::organization_setup_consent_begin,
            super::setup::organization_setup_consent_result,
            super::setup::organization_setup_consent_disconnect,
            super::setup::organization_setup_create,
            super::setup::organization_setup_group_inspect,
            super::setup::organization_setup_connect_existing,
            super::setup::organization_setup_account_refusal_detail,
            super::setup::organization_setup_reconnect_authority,
            super::session::organization_session_replicate,
            super::session::organization_session_disconnect,
            super::session::organization_session_state_get,
            super::session::organization_session_sign_in,
            super::session::organization_session_sign_out,
            super::session::organization_session_end_elsewhere,
            super::invitation::organization_invitation_member_create,
            super::invitation::organization_invitation_link_make,
            super::invitation::organization_invitation_password_unset,
            super::invitation::organization_invitation_accept,
            super::invitation::organization_invitation_machine_connect,
            super::invitation::organization_invitation_link_take,
            super::invitation::organization_invitation_link_read,
            super::member::organization_member_organization_delete,
            super::member::organization_member_rename,
            super::member::organization_member_remove,
            super::member::organization_member_lock_out_cost,
            super::member::organization_member_end_sessions,
            super::member::organization_member_change_password,
            super::member::organization_member_list,
            super::member::organization_member_standings,
            super::role::organization_role_list,
            super::role::organization_role_create,
            super::role::organization_role_rename,
            super::role::organization_role_set_mask,
            super::role::organization_role_move,
            super::role::organization_role_delete,
            super::role::organization_role_assign,
            super::role::organization_role_set_override,
            super::role::organization_role_set_workspace_override,
            super::ownership::organization_ownership_offer,
            super::ownership::organization_ownership_withdraw_offer,
            super::ownership::organization_ownership_accept,
            super::workspace::organization_workspace_rename,
            super::workspace::organization_workspace_create,
            super::workspace::organization_workspace_grant,
            super::workspace::organization_workspace_grant_withdraw,
            super::workspace::organization_workspace_delete,
            super::workspace::organization_workspace_open,
            super::workspace::organization_workspace_renew_credentials,
            super::workspace::organization_workspace_renew_due,
            super::mark::organization_mark_get,
            super::mark::organization_mark_set,
            super::mark::organization_mark_clear,
        ])
        .build()
}
