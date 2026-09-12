use std::{path::PathBuf, sync::Arc};

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::{
    error::Error,
    persisted::{Persistable, Persisted},
    settings::Settings,
    timestamp,
};

use super::turso::discovery::TursoOrganization;

use crate::organization::JoinedOrganization;

pub struct RemoteSync {
    pub(super) settings: Arc<RwLock<Persisted<Settings>>>,
    pub(super) store: Persisted<RemoteSyncStore>,
    /// the Turso credential the replica syncs with, for as long as this process runs.
    ///
    /// **In memory rather than in the store or the keyring, and that is the shape rather than a
    /// shortcut.** It is what the member's vault unsealed at sign-in, and the vault is where it
    /// lives; a copy that outlived the process would be a credential on disk with nothing gained,
    /// because the next launch opens the vault again. The store is serialised to a plain file, so
    /// a field here is exactly the field that must not be in it.
    pub(super) workspace_token: Option<String>,
    /// the last replication Turso refused for the organization's account, until one goes
    /// through. In memory, like the credential above: it is a fact about the last request and
    /// the next one is what settles it. The detail is Turso's own sentence and crosses to the
    /// owner alone (`organization::account_refusal_detail`).
    pub(super) account_refusal: Option<AccountRefusal>,
}

/// A replication Turso refused for the account: when, and what it said.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AccountRefusal {
    pub since: i64,
    pub detail: String,
}

/// What every member is told about a standing account refusal: that there is one, and since
/// when. Turso's sentence is not in it (requirement 25).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccountRefusalFacts {
    pub since: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteSyncWorkspace {
    pub id: String,
    pub name: String,
    pub local_database_path: PathBuf,
    /// the organization's own id for this workspace, learned at sign-in.
    ///
    /// **Separate from `id`, which is this machine's and predates any account.** They could have
    /// been collapsed and were not: `id` is what every local record and every diagnostic already
    /// names, and rewriting it on first sign-in would rename a workspace under everything holding
    /// it. This is the name the organization's rows carry, and it is `None` on a machine that has
    /// never opened one.
    pub remote_id: Option<String>,
    /// what the replica syncs against, `libsql://` and all. `None` until something has minted.
    ///
    /// **A URL is not a credential** and crosses to TypeScript with the rest of the state; the
    /// token it is reached with does not ([[rules/credentials]], under *Client boundary*).
    pub remote_url: Option<String>,
    /// what the signed-in member may do in this workspace, as the one number their signed row
    /// keeps it as.
    ///
    /// **A fact about what an account may ask for, not a thing that lets anybody ask**, so it
    /// crosses to TypeScript with the rest of the state exactly as the session's moments do
    /// ([[rules/credentials]], under *Client boundary*). The signed row is still what decides;
    /// this is the same answer offered earlier, so a control nobody may use is not drawn as one
    /// they may.
    ///
    /// **Zero on a store written before this existed**, which the container's `serde(default)`
    /// gives without a field attribute, and zero is the right answer to land on: it is a member
    /// who administers nothing, so an old store draws every gated control as absent or
    /// unavailable rather than offering one the service would refuse.
    ///
    /// **Nothing in Rust reads it.** The bits are named in `@rentable/workspace-permission` and
    /// both ends that decide anything go through it; this side carries the number.
    pub permissions: i64,
    pub last_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// what a workspace is called on a machine that has never opened an organization.
///
/// **A fallback and not the name.** The organization holds the name, sealed on the workspace
/// row, and a machine that has read it uses it. This is what is left for a
/// machine that has read none: an install with no organization behind it still has a workspace,
/// and a workspace with no name at all would read as a defect on every surface that draws one.
///
/// *It was written out at all three of those places and reached by defaulting, so every install
/// showed it, identically, for every person, on an application that ships in Arabic. Named once
/// here on 2026-08-21.*
pub(super) const DEFAULT_WORKSPACE_NAME: &str = "Primary workspace";

/// what an opening of the organization learned about the workspace this machine belongs to.
///
/// Every field is what *that* call answered with rather than what is true of the workspace: the
/// two callers know different halves, and `None` means this call did not say rather than the
/// workspace not having one.
#[derive(Clone, Copy, Debug)]
pub(super) struct LearnedWorkspace<'a> {
    /// the organization's own id for it, which every call that learns anything carries.
    pub remote_id: &'a str,
    /// what the organization calls it. An opening carries this; a bare credential refresh does not.
    pub name: Option<&'a str>,
    /// what the replica syncs against. A mint carries this; an identifying answer does not.
    pub url: Option<&'a str>,
    /// what the asking account may do in it. An identifying answer carries this; a mint does not,
    /// which is the same split `name` is on and for the same reason.
    pub permissions: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteSyncStore {
    pub workspace: RemoteSyncWorkspace,
    pub startup_prompt_enabled: bool,
    pub device_id: String,
    /// every workspace replica this machine holds, and whose it is.
    ///
    /// **A replica is kept indefinitely and membership is what keeps it.** It is not deleted on
    /// sign-out and not deleted on a timer: somebody who signs out is usually about to sign back
    /// in, and re-pulling a whole workspace to serve that is a cost nobody asked for. What ends a
    /// replica is the account it belongs to ceasing to be a member of the workspace it holds —
    /// then it is a copy of a ledger this machine has no right to, and it goes.
    ///
    /// *Directed by the human 2026-08-20.* Today an account owns its one workspace and membership
    /// ends only where an operator ends it, so this mostly answers *still yours*. It is built now
    /// because requirement 14's organization work is where membership starts ending routinely, and
    /// a machine that had been keeping replicas with no rule for removing them would by then be
    /// holding workspaces its owner was removed from months earlier.
    ///
    /// A list because one machine can hold replicas for several accounts.
    pub replicas: Vec<LocalReplica>,
    /// which Turso organization and group the consent on this machine was granted over.
    ///
    /// **Kept because it cannot be asked for twice cheaply.** A consented token carries neither
    /// the organization slug nor anything that maps to one, and the only route to it is a lookup
    /// against Turso's MCP server (`sync/turso/discovery.rs`). That surface is versioned at
    /// `v0.1.0` and documented for agents, so asking it once at setup and never again is what
    /// keeps a change there off the provisioning path.
    ///
    /// **Not a credential, and deliberately not in the keyring.** A slug is a name that appears
    /// in every Platform API URL this application builds; filing it as a secret would imply the
    /// URLs were. It is not in the organization database either, because it is a fact about this
    /// machine's grant rather than about the organization's members.
    ///
    /// Absent on every machine that has not granted a Turso consent, which today is all of them.
    pub turso_organization: Option<TursoOrganization>,
    /// the organizations this machine has joined, which is what the sign-in screen lists
    /// (requirement 17) and what tells sign-in which member row is this person's before a
    /// password is typed.
    ///
    /// **Facts about this machine, in the clear, and none of them a credential.** The name is
    /// the one the person typed or was shown; the verifying key is the one their join link pinned,
    /// held here so that every later verification uses it and never one read out of the database
    /// it judges; the remote is where the replica syncs. What opens anything is the password, and
    /// it is nowhere.
    pub organizations: Vec<JoinedOrganization>,
}

/// one workspace replica on this machine, and the member whose grant keeps it.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct LocalReplica {
    /// the workspace's id in its organization, which is what the file is named for.
    pub workspace_id: String,
    /// the member this machine held it for. **A replica is only ever checkable while that
    /// member's vault is open**, which is why it is recorded rather than inferred. *It was the
    /// control plane's account id until the retirement, under the same name.*
    #[serde(alias = "accountId")]
    pub member_id: String,
    pub created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSyncState {
    pub workspace: RemoteSyncWorkspace,
    pub startup_prompt_enabled: bool,
    pub device_id: String,
    /// a replication Turso refused for the organization's account, standing until one goes
    /// through. Distinct from every other reason a machine is not syncing, because a person over
    /// quota and a person offline need different things.
    pub account_refusal: Option<AccountRefusalFacts>,
}

impl Default for RemoteSyncStore {
    fn default() -> Self {
        Self {
            workspace: RemoteSyncWorkspace::default(),
            startup_prompt_enabled: true,
            device_id: String::new(),
            replicas: Vec::new(),
            turso_organization: None,
            organizations: Vec::new(),
        }
    }
}

impl Persistable for RemoteSyncStore {
    fn sanitize(&mut self) {
        self.workspace.id = sanitize_string(&self.workspace.id);
        self.workspace.name = sanitize_string(&self.workspace.name);
        self.workspace.last_error = sanitize_optional_string(self.workspace.last_error.clone());

        if self.workspace.name.is_empty() {
            self.workspace.name = DEFAULT_WORKSPACE_NAME.to_string();
        }

        if self.workspace.created_at <= 0 {
            self.workspace.created_at = timestamp::now();
        }

        if self.workspace.updated_at <= 0 {
            self.workspace.updated_at = self.workspace.created_at;
        }

        self.device_id = sanitize_string(&self.device_id);

        if self.device_id.is_empty() {
            self.device_id = format!("device-{}", timestamp::now());
        }

        // a replica held for nobody is one nothing can check.
        self.replicas
            .retain(|replica| !replica.workspace_id.trim().is_empty());

        // a remembered organization with no slug is not one, and every Platform API path this
        // application builds would carry the hole into a URL.
        self.turso_organization
            .take_if(|organization| organization.slug.trim().is_empty());

        // an organization with no id, no key or no remote cannot be signed in to, and a row
        // saying otherwise would be listed on the sign-in screen as a place nobody can go.
        self.organizations.retain(|organization| {
            !organization.id.trim().is_empty()
                && !organization.verifying_key.trim().is_empty()
                && !organization.remote_url.trim().is_empty()
                && !organization.member_id.trim().is_empty()
        });
    }
}

impl RemoteSync {
    pub const FILENAME: &'static str = "remote-sync.json";

    pub async fn new(
        settings: Arc<RwLock<Persisted<Settings>>>,
        path: PathBuf,
    ) -> Result<Self, Error> {
        let store = Persisted::<RemoteSyncStore>::load(path)?;
        let mut this = Self {
            settings,
            store,
            workspace_token: None,
            account_refusal: None,
        };
        this.reconcile().await?;
        Ok(this)
    }

    pub async fn get_state(&mut self) -> Result<RemoteSyncState, Error> {
        self.reconcile().await?;
        Ok(self.snapshot_state())
    }

    pub fn workspace(&self) -> RemoteSyncWorkspace {
        self.store.workspace.clone()
    }

    /// The machine's own record, for the organization work that reads and writes what this
    /// machine has joined and which Turso organization its consent is over.
    pub fn store_mut(&mut self) -> &mut Persisted<RemoteSyncStore> {
        &mut self.store
    }

    /// Hold the credential a member's vault unsealed for the current workspace, for the replica.
    pub(crate) fn hold_organization_workspace_token(&mut self, token: &str) {
        self.hold_workspace_token(token);
    }

    /// The workspace a member opened from their organization: recorded as this machine's current
    /// workspace, with the credential their vault unsealed held for the replica to sync with.
    ///
    /// What the retired control plane's mint learned in two calls arrives here in one, because the
    /// organization replica already holds the name, the remote and what the member may do, and
    /// the credential was sealed to them rather than minted for the occasion.
    pub(crate) fn open_organization_workspace(
        &mut self,
        remote_id: &str,
        name: &str,
        url: &str,
        permissions: i64,
        token: &str,
    ) -> Result<(), Error> {
        self.hold_workspace_token(token);
        self.record_remote_workspace(LearnedWorkspace {
            remote_id,
            name: Some(name),
            url: Some(url),
            permissions: Some(permissions),
        })
    }

    /// The name the organization now gives the current workspace, on this machine's own record,
    /// so the rail reads it before the next pull.
    pub(crate) fn rename_held_workspace(&mut self, name: &str) -> Result<(), Error> {
        if self.store.workspace.name == name {
            return Ok(());
        }

        self.store.workspace.name = name.to_string();
        self.store.workspace.updated_at = timestamp::now();

        self.store.commit()
    }

    /// Stop naming a workspace this machine may no longer open.
    ///
    /// **Called where membership ended**, and it is what gives somebody a route back: a machine
    /// that kept naming a workspace it is refused from would re-mint, be refused, and reach the
    /// same dead end on every launch forever.
    pub(crate) fn forget_remote_workspace(&mut self) -> Result<(), Error> {
        if self.store.workspace.remote_id.is_none() && self.store.workspace.remote_url.is_none() {
            return Ok(());
        }

        self.store.workspace.remote_id = None;
        self.store.workspace.remote_url = None;
        self.store.workspace.updated_at = timestamp::now();

        self.store.commit()
    }

    /// Note that this machine holds a replica of `workspace_id` for `member_id`.
    ///
    /// Idempotent, and it does **not** move `created_at` on a workspace already held: the record
    /// is of when this machine started keeping it, and re-recording it on every launch would make
    /// that number the launch time and tell nobody anything.
    pub(crate) fn remember_replica(
        &mut self,
        workspace_id: &str,
        member_id: &str,
        now: i64,
    ) -> Result<(), Error> {
        if self
            .store
            .replicas
            .iter()
            .any(|replica| replica.workspace_id == workspace_id)
        {
            return Ok(());
        }

        self.store.replicas.push(LocalReplica {
            workspace_id: workspace_id.to_string(),
            member_id: member_id.to_string(),
            created_at: now,
        });

        self.store.commit()
    }

    /// every replica this machine is holding, whether or not anybody is signed in.
    pub(crate) fn local_replicas(&self) -> Vec<LocalReplica> {
        self.store.replicas.clone()
    }

    /// Stop tracking one, because its file has been deleted.
    pub(crate) fn forget_replica(&mut self, workspace_id: &str) -> Result<(), Error> {
        let before = self.store.replicas.len();

        self.store
            .replicas
            .retain(|replica| replica.workspace_id != workspace_id);

        if self.store.replicas.len() == before {
            return Ok(());
        }

        self.store.commit()
    }

    /// the replica's credential, if this process has minted one.
    pub(crate) fn workspace_token(&self) -> Option<String> {
        self.workspace_token.clone()
    }

    /// Hold the credential the replica syncs with, replacing whatever was there.
    ///
    /// **Replacing rather than appending is the whole point**: the engine resolves the token before
    /// every request, so a re-mint reaches the next request without the replica being rebuilt.
    pub(super) fn hold_workspace_token(&mut self, token: &str) {
        self.workspace_token = Some(token.to_string());
    }

    /// what an opening of the organization learned about the workspace this machine belongs to.
    ///
    /// **A struct rather than three arguments**, because two of them are `Option<&str>` of the
    /// same type standing next to each other, and every caller fills exactly one of them: an
    /// identifying answer names the workspace and mints nothing, a mint answers with a URL and no
    /// name. Transposing two arguments in that shape compiles, writes a URL where the name goes,
    /// and shows up as a workspace called `libsql://...` in the rail.
    pub(super) fn record_remote_workspace(
        &mut self,
        learned: LearnedWorkspace<'_>,
    ) -> Result<(), Error> {
        let workspace = &mut self.store.workspace;

        // **Both facts are carried forward only for the workspace they belong to.** A sign-in
        // names the workspace and not its URL, so carrying the stored one is what keeps a machine
        // able to open offline; carrying it across a *different* workspace would hand this account
        // the previous one's database, which is the pair being internally inconsistent on disk
        // rather than merely stale. The name is the same rule and the same reason: a workspace
        // this machine has just been told about is not called whatever the last one was called.
        let same_workspace = workspace.remote_id.as_deref() == Some(learned.remote_id);
        let url = learned.url.map(str::to_string).or_else(|| {
            same_workspace
                .then(|| workspace.remote_url.clone())
                .flatten()
        });

        // **A name that arrived wins over anything held locally**, which is the whole of
        // requirement 4a: `DEFAULT_WORKSPACE_NAME` is what a machine that has never opened an
        // organization is left with, not a name to be defended against the one the workspace
        // actually has. Whitespace is not a name — `sanitize` would put the default back on the
        // next load, so taking one here would only make the store disagree with itself in between.
        let name = learned
            .name
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| {
                same_workspace
                    .then(|| workspace.name.clone())
                    .unwrap_or_else(|| DEFAULT_WORKSPACE_NAME.to_string())
            });

        // **The same rule as the name, and the same reason.** What arrived wins; what did not
        // arrive leaves the stored answer standing, but only for the workspace it was stored
        // about. Falling back to zero across a change of workspace is what makes the wrong
        // direction the safe one: a machine that has just been told about a different workspace
        // administers nothing in it until an answer says otherwise.
        let permissions = learned
            .permissions
            .or_else(|| same_workspace.then_some(workspace.permissions))
            .unwrap_or(0);

        if same_workspace
            && workspace.remote_url == url
            && workspace.name == name
            && workspace.permissions == permissions
        {
            return Ok(());
        }

        workspace.remote_id = Some(learned.remote_id.to_string());
        workspace.remote_url = url;
        workspace.name = name;
        workspace.permissions = permissions;
        workspace.updated_at = timestamp::now();

        self.store.commit()
    }

    async fn reconcile(&mut self) -> Result<(), Error> {
        let current_database_path = self.current_database_path().await;
        let now = timestamp::now();
        let mut changed = false;

        if self.store.device_id.is_empty() {
            self.store.device_id = format!("device-{}", now);
            changed = true;
        }

        if self.store.workspace.id.is_empty() {
            self.store.workspace = Self::default_workspace(current_database_path.clone(), now);
            changed = true;
        }

        if self.store.workspace.local_database_path != current_database_path {
            self.store.workspace.local_database_path = current_database_path;
            self.store.workspace.updated_at = now;
            changed = true;
        }

        if self.store.workspace.name.trim().is_empty() {
            self.store.workspace.name = DEFAULT_WORKSPACE_NAME.to_string();
            changed = true;
        }

        if self.store.startup_prompt_enabled {
            self.store.startup_prompt_enabled = false;
            changed = true;
        }

        if changed {
            self.store.commit()?;
        }

        Ok(())
    }

    pub(super) async fn current_database_path(&self) -> PathBuf {
        let settings = self.settings.read().await;

        settings.database_path.clone()
    }

    fn snapshot_state(&self) -> RemoteSyncState {
        RemoteSyncState {
            workspace: self.store.workspace.clone(),
            startup_prompt_enabled: self.store.startup_prompt_enabled,
            device_id: self.store.device_id.clone(),
            account_refusal: self
                .account_refusal
                .as_ref()
                .map(|refusal| AccountRefusalFacts {
                    since: refusal.since,
                }),
        }
    }

    /// Turso refused a replication for the account. The first refusal's moment stands until one
    /// goes through; the sentence is the latest.
    pub(crate) fn note_account_refusal(&mut self, detail: &str, now: i64) {
        let since = self
            .account_refusal
            .as_ref()
            .map_or(now, |refusal| refusal.since);

        self.account_refusal = Some(AccountRefusal {
            since,
            detail: detail.to_string(),
        });
    }

    /// A replication went through, so whatever the account was refused for is over.
    pub(crate) fn clear_account_refusal(&mut self) {
        self.account_refusal = None;
    }

    /// Turso's own sentence about the standing refusal, for the owner and nobody else; the
    /// caller decides who is asking.
    pub(crate) fn account_refusal_detail(&self) -> Option<String> {
        self.account_refusal
            .as_ref()
            .map(|refusal| refusal.detail.clone())
    }

    pub(super) fn default_workspace(path: PathBuf, now: i64) -> RemoteSyncWorkspace {
        RemoteSyncWorkspace {
            id: format!("workspace-{}", now),
            name: DEFAULT_WORKSPACE_NAME.to_string(),
            local_database_path: path,
            // A machine that has never opened an organization belongs to no workspace it can
            // name. Both arrive at the first sign-in.
            remote_id: None,
            remote_url: None,
            // and administers nothing in it until an answer says otherwise, which is the same
            // value an older store lands on.
            permissions: 0,
            last_error: None,
            created_at: now,
            updated_at: now,
        }
    }
}

pub(super) fn sanitize_string(value: &str) -> String {
    value.trim().to_string()
}

pub(super) fn sanitize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use std::{path::PathBuf, sync::Arc};

    use tokio::{runtime::Runtime, sync::RwLock};

    use super::{
        DEFAULT_WORKSPACE_NAME, LearnedWorkspace, RemoteSync, RemoteSyncStore, RemoteSyncWorkspace,
    };
    use crate::{persisted::Persisted, settings::Settings};

    fn unique_dir(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();

        std::env::temp_dir()
            .join("rentable-tests")
            .join(format!("{}-{}", name, nanos))
    }

    /// **A replica is tracked when it is opened, and tracking it twice does not move it.**
    ///
    /// The `created_at` is when this machine started holding the workspace. Re-recording on every
    /// launch would make it the launch time, which tells nobody anything.
    #[test]
    fn a_replica_is_tracked_once_with_the_member_that_keeps_it() {
        let mut remote_sync = a_remote_sync("track");

        remote_sync
            .remember_replica("ws-1", "account-1", 1_000)
            .expect("remembering");
        remote_sync
            .remember_replica("ws-1", "account-1", 9_999)
            .expect("remembering again");

        let held = remote_sync.local_replicas();

        assert_eq!(held.len(), 1, "one workspace was tracked twice");
        assert_eq!(held[0].workspace_id, "ws-1");
        assert_eq!(
            held[0].member_id, "account-1",
            "a replica does not record whose membership keeps it"
        );
        assert_eq!(
            held[0].created_at, 1_000,
            "re-tracking moved the moment it was created"
        );
    }

    /// **One machine can hold replicas for several accounts**, and forgetting one leaves the rest.
    #[test]
    fn forgetting_one_replica_leaves_the_others() {
        let mut remote_sync = a_remote_sync("forget");

        remote_sync
            .remember_replica("ws-1", "account-1", 1_000)
            .expect("first");
        remote_sync
            .remember_replica("ws-2", "account-2", 1_000)
            .expect("second");

        remote_sync.forget_replica("ws-1").expect("forgetting");

        let held = remote_sync.local_replicas();

        assert_eq!(held.len(), 1);
        assert_eq!(
            held[0].workspace_id, "ws-2",
            "the wrong replica was forgotten"
        );
    }

    /// Forgetting one nothing tracks is a no-op rather than an error: a replica deleted by hand is
    /// still one this machine has stopped holding.
    #[test]
    fn forgetting_a_replica_nothing_tracks_is_not_a_failure() {
        let mut remote_sync = a_remote_sync("forget-unknown");

        remote_sync
            .forget_replica("ws-nothing")
            .expect("forgetting");

        assert!(remote_sync.local_replicas().is_empty());
    }

    fn a_remote_sync(name: &str) -> RemoteSync {
        RemoteSync {
            settings: Arc::new(RwLock::new(
                Persisted::<Settings>::load(
                    unique_dir(&format!("{name}-settings")).join("settings.json"),
                )
                .expect("settings"),
            )),
            store: Persisted::<RemoteSyncStore>::load(unique_dir(name).join("store.json"))
                .expect("store"),
            workspace_token: None,
            account_refusal: None,
        }
    }

    /// A store written while the mode existed, or while Google accounts were rows in it, still
    /// reads, and that is the whole of the migration: `provider`, `accounts` and the control
    /// plane's session are **dropped rather than migrated**, because `RemoteSyncStore` and every
    /// struct under it derive `Deserialize` without `deny_unknown_fields`, so serde ignores a
    /// field no type claims. An install holding any of them loads unchanged and writes them away
    /// on its next commit; a replica tracked under an account id reads under the member's name.
    ///
    /// Asserted rather than reasoned about: adding `deny_unknown_fields` anywhere on this path
    /// would make every store on a developer machine unreadable, and nothing else in this file
    /// would notice.
    #[test]
    fn a_store_written_while_the_mode_existed_still_reads() {
        for written in ["\"local\"", "\"googleDrive\"", "\"hosted\""] {
            let store: RemoteSyncStore = serde_json::from_str(&format!(
                "{{\"workspace\":{{\"id\":\"workspace-1\",\"provider\":{written},\"name\":\"Primary workspace\"}},\"accounts\":[{{\"id\":\"account-1\",\"provider\":{written},\"email\":\"person@example.com\"}}],\"controlPlaneSession\":{{\"accountId\":\"account-1\",\"expiresAt\":1}},\"replicas\":[{{\"workspaceId\":\"ws-1\",\"accountId\":\"account-1\",\"createdAt\":1}}]}}"
            ))
            .expect("a store written with a provider should still read");

            assert_eq!(
                store.workspace.id, "workspace-1",
                "{written} lost the workspace"
            );
            assert_eq!(store.replicas.len(), 1, "{written} lost the replica");
            assert_eq!(
                store.replicas[0].member_id, "account-1",
                "{written} lost who the replica was held for"
            );
        }
    }

    #[test]
    fn initializes_default_workspace_from_managed_database_path() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-default-profile");
                std::fs::create_dir_all(&root).expect("failed to create test root");

                let settings_path = root.join(Settings::FILENAME);
                let mut settings =
                    Persisted::<Settings>::load(settings_path).expect("failed to load settings");
                settings.database_path = root.join("app.db");
                settings.commit().expect("failed to commit settings");

                let settings = Arc::new(RwLock::new(settings));
                let mut remote_sync = RemoteSync::new(settings, root.join(RemoteSync::FILENAME))
                    .await
                    .expect("failed to initialize remote sync");

                let state = remote_sync.get_state().await.expect("failed to get state");
                assert_eq!(state.workspace.local_database_path, root.join("app.db"));

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    #[test]
    fn reconcile_tracks_managed_database_path_changes() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = unique_dir("remote-sync-reconcile-path-change");
                std::fs::create_dir_all(&root).expect("failed to create test root");

                let settings_path = root.join(Settings::FILENAME);
                let mut settings =
                    Persisted::<Settings>::load(settings_path).expect("failed to load settings");
                settings.database_path = root.join("first.db");
                settings.commit().expect("failed to commit settings");

                let settings = Arc::new(RwLock::new(settings));
                let mut remote_sync =
                    RemoteSync::new(settings.clone(), root.join(RemoteSync::FILENAME))
                        .await
                        .expect("failed to initialize remote sync");

                {
                    let mut settings = settings.write().await;
                    settings.database_path = root.join("second.db");
                    settings.commit().expect("failed to update settings");
                }

                let state = remote_sync.get_state().await.expect("failed to get state");
                assert_eq!(state.workspace.local_database_path, root.join("second.db"));

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    /// **The name a workspace is shown by is the organization's**, which is requirement 4a.
    ///
    /// It was sent on every identifying answer and parsed away on this side, so what every install
    /// actually showed was `DEFAULT_WORKSPACE_NAME` — one English literal, identically, for every
    /// person, on an application that ships in Arabic.
    #[test]
    fn a_workspace_is_called_what_the_organization_calls_it() {
        let mut remote_sync = a_remote_sync("workspace-name-from-the-organization");

        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: Some("دار السلام"),
                url: None,
                permissions: None,
            })
            .expect("recording the workspace");

        let workspace = remote_sync.workspace();

        assert_eq!(workspace.remote_id.as_deref(), Some("workspace-7"));
        assert_eq!(workspace.name, "دار السلام");
    }

    /// **A machine that has heard no name keeps the fallback**, which is what the default exists
    /// for. It is the answer for an install with no organization behind it, not a name to be
    /// defended against the one the workspace has.
    #[test]
    fn a_workspace_nobody_has_named_keeps_the_default() {
        let mut remote_sync = a_remote_sync("workspace-name-defaulted");

        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: None,
                url: None,
                permissions: None,
            })
            .expect("recording the workspace");

        assert_eq!(remote_sync.workspace().name, DEFAULT_WORKSPACE_NAME);
    }

    /// And whitespace is not a name: `sanitize` puts the default back on the next load, so taking
    /// one here would only make the store disagree with itself in between.
    #[test]
    fn a_name_that_is_only_whitespace_is_not_a_name() {
        let mut remote_sync = a_remote_sync("workspace-name-whitespace");

        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: Some("   "),
                url: None,
                permissions: None,
            })
            .expect("recording the workspace");

        assert_eq!(remote_sync.workspace().name, DEFAULT_WORKSPACE_NAME);
    }

    /// **What the organization says last is what the workspace is called**, which is how a rename
    /// made on another machine arrives here: the next opening carries it, and nothing
    /// on this machine defends the name it was holding.
    #[test]
    fn a_later_answer_renames_the_workspace_this_machine_holds() {
        let mut remote_sync = a_remote_sync("workspace-name-renamed");

        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: Some("before"),
                url: None,
                permissions: None,
            })
            .expect("recording the workspace");
        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: Some("after"),
                url: None,
                permissions: None,
            })
            .expect("recording it again");

        assert_eq!(remote_sync.workspace().name, "after");
    }

    /// **A mint answers with a URL and no name**, so it records the first and leaves the second
    /// where it was. `MintedToken` carries a credential, a URL and an expiry: a dispatch that only
    /// mints is not what a rename travels on.
    #[test]
    fn a_mint_records_the_url_and_leaves_the_name_alone() {
        let mut remote_sync = a_remote_sync("workspace-name-through-a-mint");

        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: Some("named by the organization"),
                url: None,
                permissions: None,
            })
            .expect("recording the workspace");
        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: None,
                url: Some("libsql://workspace-7.turso.io"),
                permissions: None,
            })
            .expect("minting against it");

        let workspace = remote_sync.workspace();

        assert_eq!(workspace.name, "named by the organization");
        assert_eq!(
            workspace.remote_url.as_deref(),
            Some("libsql://workspace-7.turso.io")
        );
    }

    /// **A different workspace inherits neither**, which is the rule the URL already had and the
    /// name now shares. Carrying the URL across would hand this account the previous workspace's
    /// database; carrying the name across would call this one by the other one's name.
    #[test]
    fn a_different_workspace_inherits_neither_the_name_nor_the_url() {
        let mut remote_sync = a_remote_sync("workspace-name-across-workspaces");

        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: Some("the first one"),
                url: Some("libsql://workspace-7.turso.io"),
                permissions: None,
            })
            .expect("recording the first workspace");
        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-8",
                name: None,
                url: None,
                permissions: None,
            })
            .expect("recording the second workspace");

        let workspace = remote_sync.workspace();

        assert_eq!(workspace.remote_id.as_deref(), Some("workspace-8"));
        assert_eq!(workspace.name, DEFAULT_WORKSPACE_NAME);
        assert_eq!(workspace.remote_url, None);
    }

    /// **What the asking account may do arrives on the same answer the name does**, and this side
    /// carries the number without opening it. `@rentable/workspace-permission` is where the bits
    /// are named, and it is TypeScript.
    #[test]
    fn a_workspace_carries_what_the_organization_said_this_member_may_do() {
        let mut remote_sync = a_remote_sync("workspace-permissions-recorded");

        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: Some("دار السلام"),
                url: None,
                permissions: Some(63),
            })
            .expect("recording the workspace");

        assert_eq!(remote_sync.workspace().permissions, 63);
    }

    /// **An answer that said nothing lands on zero**, which is a member who administers nothing.
    /// It is what a store older than this field answers with, and it is the safe
    /// direction: every gated control is drawn as absent rather than offered to somebody the
    /// signed row would then refuse.
    #[test]
    fn an_answer_that_carried_no_permissions_administers_nothing() {
        let mut remote_sync = a_remote_sync("workspace-permissions-absent");

        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: Some("named but not permitted"),
                url: None,
                permissions: None,
            })
            .expect("recording the workspace");

        assert_eq!(remote_sync.workspace().permissions, 0);
    }

    /// **A mint carries none and leaves the stored answer standing**, which is the split `name` is
    /// already on: a dispatch that only mints is not what a change to what somebody may do reaches
    /// this machine on.
    #[test]
    fn a_mint_leaves_the_permissions_where_the_last_answer_put_them() {
        let mut remote_sync = a_remote_sync("workspace-permissions-through-a-mint");

        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: Some("named by the organization"),
                url: None,
                permissions: Some(8),
            })
            .expect("recording the workspace");
        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: None,
                url: Some("libsql://workspace-7.turso.io"),
                permissions: None,
            })
            .expect("minting against it");

        assert_eq!(remote_sync.workspace().permissions, 8);
    }

    /// **The later answer decides**, including downward. Somebody whose permissions were taken
    /// away on another machine hears about it on the next identifying answer, and nothing here
    /// defends the set it was holding.
    #[test]
    fn a_later_answer_can_take_permissions_away_as_well_as_give_them() {
        let mut remote_sync = a_remote_sync("workspace-permissions-revoked");

        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: None,
                url: None,
                permissions: Some(63),
            })
            .expect("recording the workspace");
        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: None,
                url: None,
                permissions: Some(0),
            })
            .expect("recording it again");

        assert_eq!(remote_sync.workspace().permissions, 0);
    }

    /// **A different workspace inherits none of it**, which is the rule the name and the URL are
    /// already on. What this account may do in one workspace says nothing about another, and
    /// carrying it across would offer administrative controls on the strength of somebody else's
    /// membership.
    #[test]
    fn a_different_workspace_inherits_no_permissions() {
        let mut remote_sync = a_remote_sync("workspace-permissions-across-workspaces");

        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-7",
                name: Some("the first one"),
                url: None,
                permissions: Some(63),
            })
            .expect("recording the first workspace");
        remote_sync
            .record_remote_workspace(LearnedWorkspace {
                remote_id: "workspace-8",
                name: None,
                url: None,
                permissions: None,
            })
            .expect("recording the second workspace");

        let workspace = remote_sync.workspace();

        assert_eq!(workspace.remote_id.as_deref(), Some("workspace-8"));
        assert_eq!(workspace.permissions, 0);
    }

    /// **A store written before this field existed reads as zero**, which the container's
    /// `serde(default)` gives without a field attribute. Asserted rather than reasoned about: the
    /// alternative to the default firing is a failed load, and a machine that could not read its
    /// own store is a machine that has signed out.
    #[test]
    fn a_store_from_before_this_field_reads_as_administering_nothing() {
        let workspace: RemoteSyncWorkspace = serde_json::from_str(
            r#"{"id":"local","name":"Riyadh","remoteId":"workspace-7","createdAt":1,"updatedAt":2}"#,
        )
        .expect("a store written before permissions existed did not load");

        assert_eq!(workspace.permissions, 0);
        assert_eq!(workspace.name, "Riyadh");
    }
}
