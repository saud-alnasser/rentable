use std::sync::{Arc, Mutex, atomic::AtomicBool};

use tauri::Manager;
use tauri::plugin::{Builder, TauriPlugin};
use tokio::sync::RwLock;

use crate::{credential, database, machine, settings, turso::consent::TursoConsent};

use super::{Shared, session};

/// the organization's commands, every sub-concept's in one handler: each is declared in its
/// sub-concept's `command.rs` and answers to its Rust name without `organization_`, so
/// `organization_member_rename` is invoked as `plugin:organization|member_rename`.
///
/// Its setup manages the organization's state ([`Shared`]): nothing open and nobody
/// signed in, beside the database, the settings, this machine's record and the upgrade port, which
/// it takes from the plugins that manage them. So it is registered after `settings`, `database`,
/// `sync` and `upgrade`. A link
/// the launch hands over is not received here but in the app's `.setup`, after this state exists
/// (`invitation/arrival.rs`): a plugin's setup runs before any window exists.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep, and the gate test in `mod.rs` reads that
/// derived list to hold every command to a gate.
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
            super::setup::organization_setup_forget_authority,
            super::setup::organization_setup_rename,
            super::session::organization_session_replicate,
            super::session::organization_session_disconnect,
            super::session::organization_session_select,
            super::session::organization_session_remove,
            super::session::organization_session_state_get,
            super::session::organization_session_sign_in,
            super::session::organization_session_sign_out,
            super::session::organization_session_end_elsewhere,
            super::session::organization_session_machines,
            super::session::organization_session_end_machine,
            super::invitation::organization_invitation_member_create,
            super::invitation::organization_invitation_link_make,
            super::invitation::organization_invitation_link_list,
            super::invitation::organization_invitation_link_revoke,
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
            super::member::organization_member_unlock,
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
            super::workspace::organization_workspace_query,
            super::workspace::organization_workspace_batch,
            super::mark::organization_mark_get,
            super::mark::organization_mark_set,
            super::mark::organization_mark_clear,
            super::upgrade::organization_upgrade_preview,
            super::upgrade::organization_upgrade_run,
            super::upgrade::organization_upgrade_awaiting,
        ])
        .setup(|app, _api| {
            app.manage(Shared {
                db: app.state::<database::Shared>().inner().clone(),
                settings: app.state::<settings::Shared>().inner().clone(),
                remote_sync: app.state::<machine::Shared>().inner().clone(),
                upgrade: app.state::<session::Upgrades>().inner().clone(),
                credentials: app.state::<credential::Credentials>().inner().clone(),
                consent: Arc::new(TursoConsent::new()),
                organization: Arc::new(RwLock::new(None)),
                member: Arc::new(RwLock::new(None)),
                arriving_link: Arc::new(Mutex::new(None)),
                signed_out_elsewhere: Arc::new(AtomicBool::new(false)),
                held_by_version: Arc::new(std::sync::Mutex::new(None)),
                old_shape_check: tokio::sync::OnceCell::new(),
            });

            Ok(())
        })
        .build()
}
