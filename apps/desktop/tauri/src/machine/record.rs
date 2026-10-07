use std::{path::PathBuf, sync::Arc};

use serde::{Deserialize, Serialize};

use super::DatabasePath;
use crate::{
    clock,
    error::Error,
    persisted::{Persistable, Persisted},
};

use crate::turso::discovery::{
    ConsentedGroup, McpEndpoint, OrganizationLookup, TursoOrganization, look_up_organization,
};

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
///
/// *Here rather than in `organization/role/permission.rs`, which re-exports all five, since effort
/// 840: the record drops a role that is no kind on load, and a record that asked `organization` for
/// the kinds would be a module `organization` writes reaching back into it.*
pub const KINDS: [&str; 4] = [OWNER, MANAGER, MEMBER, CUSTOM];

/// One organization this machine holds, as `remote-sync.json` keeps it.
///
/// *Here, with the record it is part of, since effort 840; `organization` re-exports it.*
///
/// **An entry in the record's list** (effort 851, requirement 16): `heldOrganizations`, with the
/// selected one also written under `organization` for an older build to read. It was the one
/// organization a machine held, by type, from effort 824 until then.
///
/// The verifying key is base64url, as the link spells it, and it is **the copy every
/// verification on this machine uses**: pinned from the link at connect, never refreshed from the
/// database it judges.
#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct HeldOrganization {
    pub id: String,
    /// what the person typed at creation, or what the link carried. Shown on the wall; the
    /// sealed copy in the database is what every other machine reads.
    pub name: String,
    pub verifying_key: String,
    pub remote_url: String,
    /// this machine's own id in the organization's registry of connected machines (effort 828,
    /// requirement 15), drawn once when it connected and kept for as long as it holds the
    /// organization.
    ///
    /// **Empty means a record written before this field existed**, which the first launch after
    /// the upgrade gives an id and registers: the field defaults rather than refusing, so an old
    /// record deserialises and the machine keeps what it holds. Nothing else reads the emptiness,
    /// and no write to the registry goes out under an empty id.
    pub machine_id: String,
    /// this person's member row in the organization, once a sign-in has found it. `None` on a
    /// machine that connected by link and has not signed in yet; a sign-out keeps it.
    pub member_id: Option<String>,
    /// the kind of their role there, as last read: `owner`, `manager`, `member` or `custom`. A
    /// display fact: what a member may do is what their vault holds, never this. `None` with
    /// `member_id`, and on a record an earlier build wrote with a word that is no kind, which the
    /// record's load drops and the next sign-in fills (effort 838, ticket 15).
    pub role: Option<String>,
    /// when this machine recorded the organization, whether by creating it, connecting by link,
    /// or the join and restore paths effort 824 retires.
    pub joined_at: i64,
    /// the organization format this machine has read the organization in, once it has read it
    /// in this build's (`organization::store::FORMAT_VERSION`): at the first run, a connect, a join, a sign-in or
    /// a resume that got past the format's refusal. `None` on a record written before this field
    /// existed, until the next of those.
    ///
    /// **The one fact about the format that lives outside the organization database** (effort
    /// 838, ticket 25). The `format` row is unsigned and every member can write that database, so
    /// an upgraded organization can be made to look older there; a machine that has read it in
    /// this format never transforms it again, whatever the row says (`upgrade/format/runner/`).
    pub format: Option<i64>,
    /// how far this machine has been signed out on its own, as last acknowledged: the
    /// `machine_sign_out` number for this machine and its member, read at every sign-in by
    /// password or by an opened vault and **never at a resume** (effort 846, requirement 10). A
    /// number above it in the organization database is a sign-out another machine made since, and
    /// ends this machine's session at its next launch or heartbeat; signing in again takes the
    /// number, so the same password keeps this machine in. 0 on a record written before the field
    /// existed and on a machine nobody has signed out.
    ///
    /// **Here rather than in the organization database**, after the `format` precedent: the
    /// database is replicated and this machine would be writing its own acknowledgement where the
    /// machines that end it write too.
    pub machine_signed_out: i64,
    /// which Turso organization and group the consent on this machine was granted over, for this
    /// organization (effort 851, requirement 14). It was one value at the top of the record until
    /// then, and the record's load moves it here (`RemoteSyncStore::sanitize`).
    ///
    /// **Kept because it cannot be asked for twice cheaply.** A consented token carries neither
    /// the organization slug nor anything that maps to one, and the only route to it is a lookup
    /// against Turso's MCP server (`turso/discovery/`). That surface is versioned at `v0.1.0` and
    /// documented for agents, so asking it once at setup and never again is what keeps a change
    /// there off the provisioning path.
    ///
    /// **Not a credential, and deliberately not in the keyring.** A slug is a name that appears in
    /// every Platform API URL this application builds; filing it as a secret would imply the URLs
    /// were. It is not in the organization database either, because it is a fact about this
    /// machine's grant rather than about the organization's members.
    ///
    /// Absent on every machine that has not granted a Turso consent for this organization.
    pub turso_organization: Option<TursoOrganization>,
    /// the organization's own id for the workspace this organization last had open on this
    /// machine, so going back to it opens that workspace again. `None` where it has opened none.
    pub workspace_id: Option<String>,
    /// whether this machine has read the organization's name from its signed row, after which it
    /// never falls back to the unsigned one (effort 851, the plan's *The organization's signed
    /// name*). False on every entry until that lands.
    pub name_signed: bool,
    /// when the owner signed the name this machine last read signed, the signed row's own
    /// `updated_at`, after which a row signed earlier reads as one that does not verify here: the
    /// owner signed it, but a member who can write the replica could put it back, and every
    /// machine would name what the organization was called before (effort 851, requirement 29).
    /// The owner's machine signs its own name again over such a row
    /// (`ownership::sign_organization_name`). 0 on an entry written before this field existed,
    /// which the next signed name read sets.
    pub name_signed_at: i64,
    /// whether this machine has read the organization's lock marker, the owner's own signed lock
    /// row, after which a member with no lock row that verifies reads as locked here whatever the
    /// replica later holds (effort 851, requirement 35). False on every entry until that lands.
    pub lock_marked: bool,
    /// the member who joined here by an invitation, whose own lock this machine holds them to
    /// whether or not the organization is marked (effort 851, requirement 35): an invitation is
    /// issued by a build that locks the member it names, so with no lock row of theirs that
    /// verifies they read as locked here, and deleting their row and the marker from their
    /// replica unlocks nobody. **Their own lock alone**: every other member is judged as the
    /// marker says, so a member carried over with no row reads as the organization stands.
    /// Empty on every entry no invitation was opened on.
    ///
    /// **One entry per member latched, never one for the machine** (effort 851, review): a reset
    /// link let through on a machine that holds the organization (requirement 13) latches the
    /// member it names beside whoever was latched there before, so a second member's reset never
    /// drops the first member's lock. Read and written through [`HeldOrganization::latches`] and
    /// [`HeldOrganization::latching`]. *It held one id until that review, and a record that spelled
    /// one reads as a list of it (`one_or_many`).*
    #[serde(
        skip_serializing_if = "Vec::is_empty",
        deserialize_with = "one_or_many"
    )]
    pub own_lock_latched: Vec<String>,
}

impl HeldOrganization {
    /// Whether this machine holds `member_id` to their own lock (effort 851, requirement 35).
    pub fn latches(&self, member_id: &str) -> bool {
        self.own_lock_latched
            .iter()
            .any(|latched| latched == member_id)
    }

    /// This entry with `member_id`'s own lock latched beside every one latched already.
    pub fn latching(mut self, member_id: &str) -> Self {
        if !self.latches(member_id) {
            self.own_lock_latched.push(member_id.to_string());
        }

        self
    }
}

/// The members whose own lock an entry latches, as a record spells them: a list, or the single
/// id an earlier build of effort 851 wrote, or nothing.
fn one_or_many<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Spelled {
        One(String),
        Many(Vec<String>),
    }

    Ok(match Option::<Spelled>::deserialize(deserializer)? {
        Some(Spelled::One(member_id)) => vec![member_id],
        Some(Spelled::Many(member_ids)) => member_ids,
        None => Vec::new(),
    })
}

pub struct RemoteSync {
    /// where the workspace database lives, read on every reconcile so the record follows a move.
    pub(super) database_path: Arc<dyn DatabasePath>,
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
    /// the last replication Turso refused for this member's credential that a reconnect did not
    /// settle, until one goes through. In memory, like the account refusal above. A lock-out
    /// rotated the credential and this machine either has not yet collected the re-sealed one or
    /// there is none to collect, so the member is told their access needs attention rather than
    /// shown nothing wrong.
    pub(super) credential_refusal: Option<i64>,
    /// the moment the open workspace's replica was found holding changes the workspace refuses
    /// since an upgrade, until they are discarded (effort 857, ticket 13). In memory, like the two
    /// refusals above: what keeps the changes is the record beside the replica
    /// (`database/unsendable.rs`), and every replication says so again.
    pub(super) unsendable_changes: Option<i64>,
    /// the same for the organization's replica (effort 857, ticket 20): the moment this session
    /// found it holding changes the organization refuses since an upgrade, until they are
    /// discarded. What keeps them is the record beside `org-<id>.db`, which every replication reads
    /// again.
    pub(super) unsendable_organization_changes: Option<i64>,
    /// what says when, for every moment this record keeps.
    pub(super) clock: clock::Shared,
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

/// What a member is told about a standing credential refusal a reconnect did not settle: that
/// there is one, and since when.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CredentialRefusalFacts {
    pub since: i64,
}

/// What a member is told about changes this machine holds that the workspace refuses since an
/// upgrade: that there are some, and since when this session found them.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnsendableChangesFacts {
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

/// The machine's record, `remote-sync.json`, as it is kept on disk.
///
/// **Loaded by [`RemoteSync::new`] and by nothing else in the application.** Its `sanitize` has no
/// clock, so a record loaded from disk can come back with no `device_id` and a workspace with no
/// `created_at`; the reconcile `RemoteSync::new` runs straight after the load is what fills both,
/// from the clock it holds, and commits them. A `Persisted::<RemoteSyncStore>::load` anywhere else
/// hands its caller a record missing both, and writes it back that way on its next commit. Code
/// that needs the record takes it from a `RemoteSync`, through `store_mut`; only a test loads one
/// directly.
///
/// *Documented rather than prevented (effort 840, ticket 67): the load is `Persisted`'s, generic
/// over every persisted record, and the tests that build a machine from a file use it. `sanitize`
/// filled both from the system clock until the clock became a port, earlier in the same effort.*
///
/// **Written through [`WrittenRecord`]**, which is what puts the selected organization under
/// `organization` on every write: the key an older build reads, so a build the updater rolls back
/// to finds the organization the person had chosen (effort 851, the plan's *The machine's record
/// holds a list*). What is read under that key is the current release's one organization, which
/// the load converts and nothing else reads.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", into = "WrittenRecord")]
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
    /// which Turso organization and group a consent was granted over **before any organization
    /// held here recorded it**: what a setup looked up and has not yet made an organization of.
    /// Moved into the entry of the organization a setup or a connect on the owner's Turso account
    /// records on that consent ([`Self::hold_consented`]), and into no other.
    ///
    /// **Under a key of its own, `pendingTursoOrganization`** (effort 851, requirement 39), so a
    /// restart between the consent and the create finds it again. `tursoOrganization`, where it
    /// was kept until then, is the copy of the selected organization's that older builds read
    /// ([`WrittenRecord`]), and a pending one written there was lost whenever the selected
    /// organization had a Turso organization of its own.
    pub pending_turso_organization: Option<TursoOrganization>,
    /// what the record carried under `tursoOrganization`, read by the load (`sanitize`) and never
    /// otherwise: `None` from the first sanitize on.
    ///
    /// *It was the one Turso organization of the one organization a machine held, until effort
    /// 851 gave each held organization its own ([`HeldOrganization::turso_organization`]). A
    /// record the current release wrote carries it here, and the load moves it into the entry.*
    /// A record a build of the list wrote before requirement 39 carries the pending consent's
    /// here wherever it differs from the selected organization's, and the load reads it as
    /// pending. What this build writes under the key is the selected organization's, and nothing
    /// where the selected organization has none ([`WrittenRecord`]).
    #[serde(rename = "tursoOrganization")]
    turso_organization_of_older_builds: Option<TursoOrganization>,
    /// every organization this machine holds (effort 851, requirement 16). What the wall names,
    /// and what tells sign-in which replica to open before a password is typed.
    ///
    /// **Facts about this machine, in the clear, and none of them a credential.** The name is
    /// the one the person typed or the link carried; the verifying key is the one the link
    /// pinned, held here so that every later verification uses it and never one read out of the
    /// database it judges; the remote is where the replica syncs. What opens anything is the
    /// password, and it is nowhere.
    ///
    /// **Never written as `organizations`.** That key is the list effort 824 retired, and this
    /// build's startup check and every older build read it as the shape they forget the machine
    /// over (`upgrade/shape.rs`).
    ///
    /// *It was `organizations`, a list, until 2026-09-13, and `organization`, one or none, until
    /// effort 851.*
    pub held_organizations: Vec<HeldOrganization>,
    /// the id of the organization the wall opens on: the one last signed in to (effort 851,
    /// requirement 2). `None` where nothing is held; the load points it at the first entry where
    /// it names none of them.
    pub selected_organization: Option<String>,
    /// the one organization a record the current release wrote holds, read to be converted
    /// (`sanitize`) and never otherwise. What is written under the key is the selected entry
    /// ([`WrittenRecord`]), so this is `None` from the first sanitize on and nothing reads it.
    #[serde(rename = "organization")]
    organization_of_the_current_release: Option<HeldOrganization>,
    /// what the record carried under `organizations` before a machine held one: the shape effort
    /// 824 retired, read and never interpreted.
    ///
    /// **Kept on the record until the startup check has seen it**, which is why it round-trips
    /// rather than being dropped on read. The organizations in it were built under the schema
    /// effort 824 replaced, and requirement 17 has the machine forget all of them at startup
    /// (`upgrade/shape.rs`); a commit before that check, which `reconcile` makes on a first
    /// launch, would otherwise erase the one sign the check reads. Nothing writes it once it is
    /// empty, so a record of the new shape never carries the key. The field is here because the
    /// record is what reads it; the check, and the tests that hold this field and the spellings
    /// older installs wrote, are the upgrade's.
    #[serde(rename = "organizations", skip_serializing_if = "Vec::is_empty")]
    pub organizations_of_the_old_shape: Vec<serde_json::Value>,
    /// the moment of the last replication of the workspace replica that went through: the remote
    /// took the push, or answered the pull, whether or not it had anything to bring (effort 828,
    /// requirement 25).
    ///
    /// **On the record rather than in memory, unlike the two refusals**, because it is what the
    /// standing block reads on the next launch before anything has been tried: a machine opened
    /// offline can still say when it last reached Turso. `None` on a record written before this
    /// existed and on a machine that has never reached Turso, and the block says nothing of a
    /// moment in either case. A refusal is not a reach, so a refused replication leaves it where
    /// it was.
    pub last_reached_at: Option<i64>,
    /// the organization whose consent an earlier build left in the pending slot, named by the
    /// load that converted that build's record ([`Self::convert_the_current_releases`]), and
    /// `None` once the launch has moved it or found nothing to move (`upgrade/consent.rs`).
    ///
    /// **Only the conversion names one**, because only then is the pending slot known to hold an
    /// organization's consent rather than a setup's: on any later launch it holds what a setup
    /// granted and has not yet made an organization of, and moving that, or dropping it with an
    /// organization the startup check forgets (`upgrade/shape.rs`), would hand one organization's
    /// authority to another or take a setup's from under it. On the record rather than in memory,
    /// so a credential store that did not answer at that launch is tried again at the next.
    pub consent_to_move: Option<String>,
}

/// one workspace replica on this machine, and the member whose grant keeps it.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct LocalReplica {
    /// the workspace's id in its organization, which is what the file is named for.
    pub workspace_id: String,
    /// the member this machine held it for. **A replica is only ever checkable while that
    /// member's vault is open**, which is why it is recorded rather than inferred. *`accountId`
    /// survives as an alias because records written by older installs carry the field under
    /// that name, and a record on disk is not renamed under it.*
    #[serde(alias = "accountId")]
    pub member_id: String,
    /// the organization the workspace is of, so what is held for one organization is found
    /// without asking another's replica (effort 851, requirement 5). Empty on an entry the
    /// current release wrote, which the record's load fills from the one organization it held.
    pub organization_id: String,
    pub created_at: i64,
}

/// `remote-sync.json` as this build writes it: the record, with the selected organization under
/// `organization` as well as in the list, and the selected organization's Turso organization at
/// the top as well as in its entry; where the selected organization has none, the top carries
/// nothing. What a setup looked up is written under `pendingTursoOrganization` alone, which is
/// where this build reads it (effort 851, requirement 39).
///
/// **The top never carries a setup's.** A build rolled back to reads it as the Turso organization
/// of the one organization it holds, and the load after the roll forward converts it into that
/// organization's entry, so a setup's written there would become the selected organization's,
/// over another account. An older build that finds nothing there looks its consent's up, as it
/// does after its own first consent, and needs no copy of a setup's.
///
/// **The copy under `organization` is what keeps a rolled-back build working** (effort 851, the
/// plan's *The machine's record holds a list*): the updater has a way back to the previous
/// release, and that build reads this key and knows nothing of the list. It drops the list at its
/// next commit, so after a rollback the other organizations' entries are gone while their files
/// stay on disk; adding them again takes a link. **The copy under `tursoOrganization` is the same
/// promise for the owner**: a rolled-back build reads the Turso organization its consent is over
/// from there, and without it the owner's machine would hold no Turso authority.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WrittenRecord {
    workspace: RemoteSyncWorkspace,
    startup_prompt_enabled: bool,
    device_id: String,
    replicas: Vec<LocalReplica>,
    #[serde(skip_serializing_if = "Option::is_none")]
    turso_organization: Option<TursoOrganization>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pending_turso_organization: Option<TursoOrganization>,
    held_organizations: Vec<HeldOrganization>,
    selected_organization: Option<String>,
    organization: Option<HeldOrganization>,
    #[serde(rename = "organizations", skip_serializing_if = "Vec::is_empty")]
    organizations_of_the_old_shape: Vec<serde_json::Value>,
    last_reached_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    consent_to_move: Option<String>,
}

impl From<RemoteSyncStore> for WrittenRecord {
    fn from(store: RemoteSyncStore) -> Self {
        let organization = store.selected().cloned();
        let turso_organization = organization
            .as_ref()
            .and_then(|held| held.turso_organization.clone());

        Self {
            workspace: store.workspace,
            startup_prompt_enabled: store.startup_prompt_enabled,
            device_id: store.device_id,
            replicas: store.replicas,
            turso_organization,
            pending_turso_organization: store.pending_turso_organization,
            held_organizations: store.held_organizations,
            selected_organization: store.selected_organization,
            organization,
            organizations_of_the_old_shape: store.organizations_of_the_old_shape,
            last_reached_at: store.last_reached_at,
            consent_to_move: store.consent_to_move,
        }
    }
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
    /// a replication Turso refused for this member's credential that a reconnect did not settle,
    /// standing until one goes through. Distinct from the account's refusal, which is the owner's
    /// to see to, and from a fault: this is a credential that stopped being accepted.
    pub credential_refusal: Option<CredentialRefusalFacts>,
    /// changes the open workspace's replica holds that the workspace refuses since an upgrade,
    /// kept until the person discards them (effort 857, ticket 13). Distinct from the refusals
    /// above: nothing about the account or the credential is wrong, and only the person can say
    /// what becomes of them.
    pub unsendable_changes: Option<UnsendableChangesFacts>,
    /// changes the organization's replica holds that the organization refuses since an upgrade,
    /// kept until the person discards them (effort 857, ticket 20). The workspace goes on syncing;
    /// what waits is the organization's own push and pull.
    pub unsendable_organization_changes: Option<UnsendableChangesFacts>,
    /// the moment of the last replication that went through, or `None` before any has. What the
    /// standing block says beside "up to date". A fact about a request and not a credential, so
    /// it crosses ([[rules/credentials]], under *Client boundary*).
    pub last_reached_at: Option<i64>,
}

impl Default for RemoteSyncStore {
    fn default() -> Self {
        Self {
            workspace: RemoteSyncWorkspace::default(),
            startup_prompt_enabled: true,
            device_id: String::new(),
            replicas: Vec::new(),
            pending_turso_organization: None,
            turso_organization_of_older_builds: None,
            held_organizations: Vec::new(),
            selected_organization: None,
            organization_of_the_current_release: None,
            organizations_of_the_old_shape: Vec::new(),
            last_reached_at: None,
            consent_to_move: None,
        }
    }
}

impl RemoteSyncStore {
    /// the organization the wall opens on, where one is held.
    pub fn selected(&self) -> Option<&HeldOrganization> {
        let selected = self.selected_organization.as_deref()?;

        self.held(selected)
    }

    /// the same, to change in place. The caller commits.
    pub fn selected_mut(&mut self) -> Option<&mut HeldOrganization> {
        let selected = self.selected_organization.clone()?;

        self.held_mut(&selected)
    }

    /// the organization this machine holds by that id, where it holds it.
    pub fn held(&self, organization_id: &str) -> Option<&HeldOrganization> {
        self.held_organizations
            .iter()
            .find(|held| held.id == organization_id)
    }

    /// the same, to change in place. The caller commits.
    pub fn held_mut(&mut self, organization_id: &str) -> Option<&mut HeldOrganization> {
        self.held_organizations
            .iter_mut()
            .find(|held| held.id == organization_id)
    }

    /// Record `organization` as held, in place of any entry with its id, and select it. The caller
    /// commits.
    ///
    /// **The pending consent's Turso organization stays pending.** Every sign-in, connect and
    /// succession holds an entry again, so an entry held without a Turso organization of its own
    /// is no sign that the pending consent was granted for it: a setup abandoned for another
    /// organization would otherwise lend its slug to whichever organization was signed in to
    /// next, and the launch would then file the pending token under that one (effort 851,
    /// requirement 14). Only a path that consumes the consent moves it ([`Self::hold_consented`]).
    pub fn hold(&mut self, organization: HeldOrganization) {
        let before = self.selected_organization.replace(organization.id.clone());

        match self
            .held_organizations
            .iter_mut()
            .find(|held| held.id == organization.id)
        {
            Some(held) => *held = organization,
            None => self.held_organizations.push(organization),
        }

        // another organization held beside the one selected before: the current workspace and
        // what was last reached are that one's, and they follow the selection (effort 851). A
        // machine that held nothing keeps what it had, which is today's first run.
        if before.is_some() && before != self.selected_organization {
            self.selection_followed();
        }
    }

    /// Record `organization` as held, as [`Self::hold`] does, with the Turso organization a setup
    /// looked up before anything was held moved into it where the entry carries none of its own.
    /// The caller commits.
    ///
    /// **Only for the two paths that consume the pending consent**: the first run, which made the
    /// organization on it, and the connect on the owner's Turso account, which found the
    /// organization through it.
    pub fn hold_consented(&mut self, mut organization: HeldOrganization) {
        if organization.turso_organization.is_none() {
            organization.turso_organization = self.pending_turso_organization.take();
        }

        self.hold(organization);
    }

    /// Select the organization `organization_id`, where this machine holds it, and answer whether
    /// the selection moved. The caller commits.
    ///
    /// **The current workspace and the moment last reached follow the selection** (effort 851,
    /// the plan's *The machine's record holds a list*): both describe the organization that is
    /// open, and a workspace left naming another organization's would be the one the wall opens
    /// and the next sign-in judges.
    pub fn select(&mut self, organization_id: &str) -> bool {
        if self.held(organization_id).is_none()
            || self.selected_organization.as_deref() == Some(organization_id)
        {
            return false;
        }

        self.selected_organization = Some(organization_id.to_string());
        self.selection_followed();

        true
    }

    /// Stop holding the organization `organization_id`: its entry and every replica entry of it,
    /// with any workspace in `workspaces` besides, which is what a replica entry naming no
    /// organization was found to be of. Where it was selected, the selection moves to the first
    /// organization still held, or to none, which is the welcome. Answers whether it was the
    /// selected one. The caller commits, and the files are the caller's.
    pub fn forget_held(&mut self, organization_id: &str, workspaces: &[String]) -> bool {
        let was_selected = self.selected_organization.as_deref() == Some(organization_id);

        self.held_organizations
            .retain(|held| held.id != organization_id);
        self.replicas.retain(|replica| {
            replica.organization_id != organization_id
                && !workspaces.contains(&replica.workspace_id)
        });

        if was_selected {
            self.selected_organization =
                self.held_organizations.first().map(|held| held.id.clone());
            self.selection_followed();
        } else if self
            .workspace
            .remote_id
            .as_ref()
            .is_some_and(|current| workspaces.contains(current))
        {
            // a workspace of the forgotten organization still current, which nothing selected
            // names: it goes with the organization.
            self.workspace_follows(None);
        }

        was_selected
    }

    /// The current workspace becomes the one the selected organization last had open, where this
    /// machine still holds a replica of it for that organization, or none; and the moment last
    /// reached, which was the previous workspace's, goes.
    fn selection_followed(&mut self) {
        let workspace = self.selected().and_then(|held| {
            held.workspace_id.clone().filter(|workspace_id| {
                self.replicas.iter().any(|replica| {
                    &replica.workspace_id == workspace_id && replica.organization_id == held.id
                })
            })
        });

        self.workspace_follows(workspace);
        self.last_reached_at = None;
    }

    /// Make `workspace_id` the current workspace, as nothing is yet known about it but its id: no
    /// remote, the default name and nothing administered, which is what a later opening fills in
    /// (`RemoteSync::open_organization_workspace`). Nothing moves where it is already current.
    fn workspace_follows(&mut self, workspace_id: Option<String>) {
        if self.workspace.remote_id == workspace_id {
            return;
        }

        self.workspace.remote_id = workspace_id;
        self.workspace.remote_url = None;
        self.workspace.name = DEFAULT_WORKSPACE_NAME.to_string();
        self.workspace.permissions = 0;
    }

    /// which Turso organization a consent on this machine is over, as the record knows it: the
    /// held organization `organization_id`'s own, or, with `None`, the pending consent's, which
    /// a setup looked up before any organization held here recorded it.
    ///
    /// **Never another organization's** (effort 851, requirement 14): each organization keeps the
    /// one its own consent was granted over, so an owner of two on two Turso accounts never builds
    /// a path for one out of the other's slug.
    pub fn consent_organization(
        &self,
        organization_id: Option<&str>,
    ) -> Option<&TursoOrganization> {
        match organization_id {
            Some(organization_id) => self.held(organization_id)?.turso_organization.as_ref(),
            None => self.pending_turso_organization.as_ref(),
        }
    }

    /// Remember which Turso organization a consent is over, where
    /// [`Self::consent_organization`] reads it for the same `organization_id`. An id this machine
    /// does not hold remembers nothing. The caller commits.
    pub fn remember_consent_organization(
        &mut self,
        organization_id: Option<&str>,
        organization: TursoOrganization,
    ) {
        match organization_id {
            Some(organization_id) => {
                if let Some(held) = self.held_mut(organization_id) {
                    held.turso_organization = Some(organization);
                }
            }
            None => self.pending_turso_organization = Some(organization),
        }
    }

    /// Forget it, from where [`Self::consent_organization`] reads it for the same
    /// `organization_id`. The caller commits.
    pub fn forget_consent_organization(&mut self, organization_id: Option<&str>) {
        match organization_id {
            Some(organization_id) => {
                if let Some(held) = self.held_mut(organization_id) {
                    held.turso_organization = None;
                }
            }
            None => self.pending_turso_organization = None,
        }
    }

    /// The current release's one organization, made the list's one entry and selected (effort
    /// 851, requirement 16): the Turso organization its consent is over moves into it, the
    /// workspace the machine has open is the one it last had open, and every replica entry with
    /// no organization is its. Only where the list is empty, which is a record no build of the
    /// list has written since an older one did.
    fn convert_the_current_releases(&mut self) {
        let Some(mut organization) = self.organization_of_the_current_release.take() else {
            return;
        };

        if !self.held_organizations.is_empty() || !holdable(&organization) {
            return;
        }

        if organization.turso_organization.is_none() {
            organization.turso_organization = self.turso_organization_of_older_builds.take();
        }

        if organization.workspace_id.is_none() {
            organization.workspace_id = self.workspace.remote_id.clone();
        }

        for replica in &mut self.replicas {
            if replica.organization_id.trim().is_empty() {
                replica.organization_id = organization.id.clone();
            }
        }

        // the consent the earlier build filed in the pending slot was this organization's, and
        // the launch moves it (`upgrade/consent.rs`): this load is the one moment that is known.
        self.consent_to_move = Some(organization.id.clone());
        self.selected_organization = Some(organization.id.clone());
        self.held_organizations.push(organization);
    }
}

/// whether an entry can be signed in to at all: an organization with no id, no key or no remote
/// cannot, and a record saying otherwise would name a place on the wall that nobody can go.
fn holdable(organization: &HeldOrganization) -> bool {
    !(organization.id.trim().is_empty()
        || organization.verifying_key.trim().is_empty()
        || organization.remote_url.trim().is_empty())
}

/// a remembered Turso organization with no slug is not one, and every Platform API path this
/// application builds would carry the hole into a URL.
fn sanitize_turso_organization(organization: &mut Option<TursoOrganization>) {
    organization.take_if(|organization| organization.slug.trim().is_empty());
}

impl Persistable for RemoteSyncStore {
    fn sanitize(&mut self) {
        self.workspace.id = sanitize_string(&self.workspace.id);
        self.workspace.name = sanitize_string(&self.workspace.name);
        self.workspace.last_error = sanitize_optional_string(self.workspace.last_error.clone());

        if self.workspace.name.is_empty() {
            self.workspace.name = DEFAULT_WORKSPACE_NAME.to_string();
        }

        // a moment at or before the epoch is filled in by `RemoteSync::reconcile`, which holds the
        // clock and runs on every load that reaches the application.
        if self.workspace.updated_at <= 0 {
            self.workspace.updated_at = self.workspace.created_at;
        }

        // a moment at or before the epoch is no moment.
        self.last_reached_at = self.last_reached_at.filter(|moment| *moment > 0);

        // an empty device id is given one by `RemoteSync::reconcile`, for the same reason.
        self.device_id = sanitize_string(&self.device_id);

        // a replica held for nobody is one nothing can check.
        self.replicas
            .retain(|replica| !replica.workspace_id.trim().is_empty());

        sanitize_turso_organization(&mut self.pending_turso_organization);
        sanitize_turso_organization(&mut self.turso_organization_of_older_builds);

        // the current release's one organization becomes the list's one entry, before anything
        // below reads the list. No keyring is needed for it, so it runs here, at load, and the
        // load commits it at once.
        self.convert_the_current_releases();

        // an organization that cannot be signed in to is not held, and one id is held once.
        let mut seen = std::collections::HashSet::new();

        self.held_organizations
            .retain(|organization| holdable(organization) && seen.insert(organization.id.clone()));

        // a member id of nothing is no member: the same answer as a machine that has connected
        // and not signed in, and it is spelled that way rather than two ways. A role that is no
        // kind of role is one an earlier build recorded, the manager's older name or `removed`
        // (effort 838, ticket 15): it is a display fact, so it reads as none rather than being
        // translated, and the next sign-in records the kind.
        for organization in &mut self.held_organizations {
            organization.member_id = organization
                .member_id
                .take()
                .filter(|member_id| !member_id.trim().is_empty());
            organization.role = organization
                .role
                .take()
                .filter(|role| KINDS.contains(&role.as_str()));
            organization.workspace_id = organization
                .workspace_id
                .take()
                .filter(|workspace_id| !workspace_id.trim().is_empty());
            sanitize_turso_organization(&mut organization.turso_organization);
        }

        // a selection that names nothing held selects the first organization held, so a machine
        // holding one always opens on it, and a machine holding none selects nothing.
        if self.selected().is_none() {
            self.selected_organization = self
                .held_organizations
                .first()
                .map(|organization| organization.id.clone());
        }

        // the Turso organization at the top is the copy for older builds, and is read only from a
        // record that has no pending one under its own key: one a build of the list wrote before
        // requirement 39, where a value there that is not the selected organization's own is a
        // setup's. The selected organization's own, read back from the copy every write puts
        // there, is that copy and not a setup's.
        let older = self.turso_organization_of_older_builds.take();

        if self.pending_turso_organization.is_none() {
            let the_selected_ones = self
                .selected()
                .and_then(|held| held.turso_organization.as_ref())
                .is_some_and(|held| older.as_ref() == Some(held));

            if !the_selected_ones {
                self.pending_turso_organization = older;
            }
        }
    }
}

impl RemoteSync {
    pub const FILENAME: &'static str = "remote-sync.json";

    pub async fn new(
        database_path: Arc<dyn DatabasePath>,
        path: PathBuf,
        clock: clock::Shared,
    ) -> Result<Self, Error> {
        // recovered rather than loaded: a record cut short comes back from its last good copy,
        // with every organization it held (effort 854, requirement 17).
        let store = Persisted::<RemoteSyncStore>::recover(path, clock.as_ref())?;
        let mut this = Self {
            database_path,
            store,
            workspace_token: None,
            account_refusal: None,
            credential_refusal: None,
            unsendable_changes: None,
            unsendable_organization_changes: None,
            clock,
        };
        // committed as a launch commits, so a record that cannot be written is named (ticket 38).
        if this.reconciled().await {
            this.store.commit_at_launch()?;
        }
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
    /// It arrives in one call because the organization replica already holds the name, the remote
    /// and what the member may do, and the credential was sealed to them rather than minted for
    /// the occasion.
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
        self.store.workspace.updated_at = self.clock.now();

        self.store.commit()
    }

    /// The name the owner just gave the organization, on this machine's own entry for it, so the
    /// wall and the switcher read it before anything is read again (effort 851, requirement 25).
    /// The name is the one the owner signed at `signed_at`, so the entry is latched to signed
    /// names, and to none signed before it, as a read of the signed row latches it
    /// (`HeldOrganization::name_signed`, `HeldOrganization::name_signed_at`). An organization this
    /// machine does not hold changes nothing.
    pub(crate) fn rename_held_organization(
        &mut self,
        organization_id: &str,
        name: &str,
        signed_at: i64,
    ) -> Result<(), Error> {
        let Some(entry) = self.store.held_mut(organization_id) else {
            return Ok(());
        };

        if entry.name == name && entry.name_signed && entry.name_signed_at == signed_at {
            return Ok(());
        }

        entry.name = name.to_string();
        entry.name_signed = true;
        entry.name_signed_at = signed_at;

        self.store.commit()
    }

    /// Forget one organization this machine holds, on the record: its entry, every replica entry
    /// of it and of the workspaces in `workspaces`, and, where it was the selected one, the
    /// selection, the workspace it had open and what this process held and heard for it. Every
    /// other organization's entry and replica entries are left as they were (effort 851,
    /// requirement 5). Answers whether it was the selected one.
    ///
    /// **The files are the caller's** (`organization::session::forget`), which deletes them before
    /// this runs. A machine left holding nothing is left as one that never held an organization:
    /// the workspace is a fresh default named for now.
    pub(crate) async fn forget_held_organization(
        &mut self,
        organization_id: &str,
        workspaces: &[String],
    ) -> Result<bool, Error> {
        let was_selected = self.store.forget_held(organization_id, workspaces);

        if was_selected {
            self.forget_what_the_open_one_held();
        }

        if self.store.held_organizations.is_empty() {
            let database_path = self.current_database_path().await;

            self.store.workspace = Self::default_workspace(database_path, self.clock.now());
            self.store.last_reached_at = None;
        }

        self.store.commit()?;

        Ok(was_selected)
    }

    /// Select the organization `organization_id` for the wall to open on (effort 851, requirement
    /// 3), and answer whether the selection moved. What this process held and heard for the open
    /// organization goes either way, since nothing is open while one is selected.
    pub(crate) fn select_organization(&mut self, organization_id: &str) -> Result<bool, Error> {
        let moved = self.store.select(organization_id);

        if moved {
            self.store.workspace.updated_at = self.clock.now();
        }

        self.forget_what_the_open_one_held();
        self.store.last_reached_at = None;
        self.store.commit()?;

        Ok(moved)
    }

    /// A sign-out: whatever Turso last refused and the moment last reached were the open
    /// organization's, and nothing is open now (effort 851, the plan's *The machine's record holds
    /// a list*).
    pub(crate) fn note_signed_out(&mut self) -> Result<(), Error> {
        self.account_refusal = None;
        self.credential_refusal = None;
        self.unsendable_changes = None;
        self.unsendable_organization_changes = None;

        if self.store.last_reached_at.take().is_none() {
            return Ok(());
        }

        self.store.commit()
    }

    /// Stop carrying the old shape's list, which the startup check has read and forgotten
    /// (`upgrade/shape.rs`); a machine holding nothing afterwards is left as one that never held
    /// an organization.
    pub(crate) async fn forget_the_old_shapes_list(&mut self) -> Result<(), Error> {
        self.store.organizations_of_the_old_shape.clear();

        if self.store.held_organizations.is_empty() {
            let database_path = self.current_database_path().await;

            self.store.workspace = Self::default_workspace(database_path, self.clock.now());
            self.store.last_reached_at = None;
        }

        self.store.commit()
    }

    /// The credential this process held for the open organization's workspace, and what Turso
    /// last refused it: each was the open organization's, and none of it is anybody's once that
    /// organization is not open.
    fn forget_what_the_open_one_held(&mut self) {
        self.workspace_token = None;
        self.account_refusal = None;
        self.credential_refusal = None;
        self.unsendable_changes = None;
        self.unsendable_organization_changes = None;
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
        self.store.workspace.updated_at = self.clock.now();

        // and the open organization stops naming it as the one to open again.
        if let Some(held) = self.store.selected_mut() {
            held.workspace_id = None;
        }

        self.store.commit()
    }

    /// Note that this machine holds a replica of `workspace_id` for `member_id`, of the
    /// organization `organization_id`.
    ///
    /// Idempotent, and it does **not** move `created_at` on a workspace already held: the record
    /// is of when this machine started keeping it, and re-recording it on every launch would make
    /// that number the launch time and tell nobody anything.
    pub(crate) fn remember_replica(
        &mut self,
        workspace_id: &str,
        member_id: &str,
        organization_id: &str,
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
            organization_id: organization_id.to_string(),
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
        workspace.updated_at = self.clock.now();

        // the workspace is the open organization's, and the one it last had open.
        if let Some(held) = self.store.selected_mut() {
            held.workspace_id = Some(learned.remote_id.to_string());
        }

        self.store.commit()
    }

    async fn reconcile(&mut self) -> Result<(), Error> {
        if self.reconciled().await {
            self.store.commit()?;
        }

        Ok(())
    }

    /// Bring the record in line with this machine, and say whether anything changed, which the
    /// caller commits.
    async fn reconciled(&mut self) -> bool {
        let current_database_path = self.current_database_path().await;
        let now = self.clock.now();
        let mut changed = false;

        if self.store.device_id.is_empty() {
            self.store.device_id = format!("device-{}", now);
            changed = true;
        }

        if self.store.workspace.id.is_empty() {
            self.store.workspace = Self::default_workspace(current_database_path.clone(), now);
            changed = true;
        }

        // the two moments `sanitize` leaves for this, since it has no clock: a record written with
        // no moment it was made is made now, and one never updated was updated when it was made.
        if self.store.workspace.created_at <= 0 {
            self.store.workspace.created_at = now;
            changed = true;
        }

        if self.store.workspace.updated_at <= 0 {
            self.store.workspace.updated_at = self.store.workspace.created_at;
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

        changed
    }

    pub(super) async fn current_database_path(&self) -> PathBuf {
        self.database_path.database_path().await
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
            credential_refusal: self
                .credential_refusal
                .map(|since| CredentialRefusalFacts { since }),
            unsendable_changes: self
                .unsendable_changes
                .map(|since| UnsendableChangesFacts { since }),
            unsendable_organization_changes: self
                .unsendable_organization_changes
                .map(|since| UnsendableChangesFacts { since }),
            last_reached_at: self.store.last_reached_at,
        }
    }

    /// A replication of the workspace replica went through at `now`: the remote took the push,
    /// or answered the pull. Written on the record at once, since it is what the block reads on
    /// the next launch before anything has been tried.
    pub(crate) fn note_reached(&mut self, now: i64) -> Result<(), Error> {
        self.store.last_reached_at = Some(now);

        self.store.commit()
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

    /// Turso refused a replication for this member's credential and a reconnect did not settle it.
    /// The first refusal's moment stands until one goes through.
    pub(crate) fn note_credential_refusal(&mut self, now: i64) {
        self.credential_refusal.get_or_insert(now);
    }

    /// A replication went through, so whatever the credential was refused for is over.
    pub(crate) fn clear_credential_refusal(&mut self) {
        self.credential_refusal = None;
    }

    /// The open workspace's replica holds changes the workspace refuses since an upgrade. The
    /// first moment this session found them stands until they are discarded.
    pub(crate) fn note_unsendable_changes(&mut self, now: i64) {
        self.unsendable_changes.get_or_insert(now);
    }

    /// The changes the workspace refused are gone: discarded at the person's word, or never there
    /// for a replica that has since pushed.
    pub(crate) fn clear_unsendable_changes(&mut self) {
        self.unsendable_changes = None;
    }

    /// Whether the organization's replica holds changes the organization refuses since an upgrade,
    /// as a replication read it (effort 857, ticket 20): the first moment this session found them
    /// stands until they are gone, and a replica found holding none clears it.
    pub(crate) fn note_unsendable_organization_changes(&mut self, held: bool, now: i64) {
        if held {
            self.unsendable_organization_changes.get_or_insert(now);
        } else {
            self.unsendable_organization_changes = None;
        }
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

/// The organization a consent on this machine is over: asked for once, and remembered, for the held
/// organization `organization_id` or, with `None`, for the pending consent a setup or a connect is
/// about to make an organization of.
///
/// **Remembered per organization, and read for that organization alone** (effort 851, requirement
/// 14). It was one value for the machine until then, which a second organization's setup would have
/// read as its own and created its database on the first organization's account.
///
/// **Nothing asks twice.** The lookup is the one thing in this effort that depends on a surface
/// Turso versions for agents, so every call after the first is answered from this machine's own
/// store and no request leaves the process. `None` is an empty group rather than a failure, and
/// the caller creates the first database and reads the slug out of what comes back.
///
/// **Here, beside the record it remembers into, rather than in `turso/discovery/`.** The lookup
/// is Turso's; the remembering is this machine's, and a Turso adapter that wrote this machine's
/// record would reach back into `machine` from the module `machine` reaches for.
pub async fn consented_organization(
    store: &mut Persisted<RemoteSyncStore>,
    organization_id: Option<&str>,
    platform_token: &str,
    endpoint: &McpEndpoint,
) -> Result<Option<ConsentedGroup>, Error> {
    if let Some(known) = store.consent_organization(organization_id).cloned() {
        return Ok(Some(ConsentedGroup {
            organization: known,
            databases: None,
        }));
    }

    match look_up_organization(platform_token, endpoint).await? {
        OrganizationLookup::Found {
            organization,
            databases,
        } => {
            store.remember_consent_organization(organization_id, organization.clone());
            store.commit()?;

            Ok(Some(ConsentedGroup {
                organization,
                databases: Some(databases),
            }))
        }
        OrganizationLookup::NoDatabaseYet => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use std::{path::PathBuf, sync::Arc};

    use tokio::{runtime::Runtime, sync::RwLock};

    use super::{
        DEFAULT_WORKSPACE_NAME, LearnedWorkspace, RemoteSync, RemoteSyncStore, RemoteSyncWorkspace,
    };
    use crate::test::scratch;
    use crate::{
        persisted::{Persistable as _, Persisted},
        settings::Settings,
    };

    /// **A replica is tracked when it is opened, and tracking it twice does not move it.**
    ///
    /// The `created_at` is when this machine started holding the workspace. Re-recording on every
    /// launch would make it the launch time, which tells nobody anything.
    #[test]
    fn a_replica_is_tracked_once_with_the_member_that_keeps_it() {
        let mut remote_sync = a_remote_sync("track");

        remote_sync
            .remember_replica("ws-1", "account-1", "org-1", 1_000)
            .expect("remembering");
        remote_sync
            .remember_replica("ws-1", "account-1", "org-1", 9_999)
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
            .remember_replica("ws-1", "account-1", "org-1", 1_000)
            .expect("first");
        remote_sync
            .remember_replica("ws-2", "account-2", "org-2", 1_000)
            .expect("second");

        remote_sync.forget_replica("ws-1").expect("forgetting");

        let held = remote_sync.local_replicas();

        assert_eq!(held.len(), 1);
        assert_eq!(
            held[0].workspace_id, "ws-2",
            "the wrong replica was forgotten"
        );
    }

    /// **The moment of the last replication that went through is on the record, and absent
    /// before any went** (effort 828, criterion 25). Absent on a fresh record; written where a
    /// replication completes; read back off the file by the next launch, which is what puts it
    /// on the record rather than in memory beside the two refusals.
    #[test]
    fn the_moment_of_the_last_replication_that_went_through_is_recorded_and_absent_before() {
        let path = scratch("last-reached").join("store.json");
        let mut remote_sync = a_remote_sync_at(path.clone());

        assert_eq!(
            remote_sync.snapshot_state().last_reached_at,
            None,
            "a machine that has reached nothing carries a moment"
        );

        remote_sync.note_reached(1_000).expect("noting the reach");

        assert_eq!(
            remote_sync.snapshot_state().last_reached_at,
            Some(1_000),
            "a completed replication left no moment"
        );

        let reloaded = a_remote_sync_at(path);

        assert_eq!(
            reloaded.snapshot_state().last_reached_at,
            Some(1_000),
            "the moment did not survive a relaunch"
        );
    }

    /// And a record from before the moment existed reads with none, rather than with a zero the
    /// block would render as 1970.
    #[test]
    fn a_record_written_before_the_moment_existed_reads_with_none() {
        let mut store: RemoteSyncStore = serde_json::from_str(
            r#"{"workspace":{"id":"workspace-1","name":"Riyadh"},"lastReachedAt":0}"#,
        )
        .expect("the record");

        store.sanitize();

        assert_eq!(store.last_reached_at, None);

        let older: RemoteSyncStore =
            serde_json::from_str(r#"{"workspace":{"id":"workspace-1","name":"Riyadh"}}"#)
                .expect("the record");

        assert_eq!(older.last_reached_at, None);
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

    /// `remote-sync.json` as release 0.19.0 writes it, frozen (effort 851, criterion 16): one
    /// organization, signed in as its owner, with the Turso organization its consent is over, two
    /// workspace replicas and the workspace it had open. Never edited: a record on disk is what the
    /// conversion has to meet, and a fixture that followed the code would meet nothing.
    ///
    /// **Written out byte for byte here and in the tests of `organization/session/command.rs`**,
    /// as a fixture used by more than one module is (`rules/testing`).
    const RELEASED: &str = r#"{
  "workspace": {
    "id": "workspace-1759000000000",
    "name": "Riyadh",
    "localDatabasePath": "C:\\Users\\someone\\AppData\\Roaming\\rentable\\app.db",
    "remoteId": "wks-north",
    "remoteUrl": "libsql://rentable-wks-north-acme.aws-eu-west-1.turso.io",
    "permissions": 63,
    "lastError": null,
    "createdAt": 1759000000000,
    "updatedAt": 1759500000000
  },
  "startupPromptEnabled": false,
  "deviceId": "device-1759000000000",
  "replicas": [
    {
      "workspaceId": "wks-north",
      "memberId": "mem-olivia",
      "createdAt": 1759000100000
    },
    {
      "workspaceId": "wks-south",
      "memberId": "mem-olivia",
      "createdAt": 1759000200000
    }
  ],
  "tursoOrganization": {
    "slug": "acme",
    "group": "rentable"
  },
  "organization": {
    "id": "org-acme",
    "name": "Acme",
    "verifyingKey": "c29tZS12ZXJpZnlpbmcta2V5LW9mLXRoaXJ0eS10d28tYnl0ZXM",
    "remoteUrl": "libsql://rentable-org-acme-acme.aws-eu-west-1.turso.io",
    "machineId": "mch-this-one",
    "memberId": "mem-olivia",
    "role": "owner",
    "joinedAt": 1759000000000,
    "format": 3,
    "machineSignedOut": 3
  },
  "lastReachedAt": 1759600000000
}
"#;

    /// The released record, written where a launch would find it, loaded as a launch loads it,
    /// and read back off the disk.
    fn released_record_loaded(name: &str) -> (Persisted<RemoteSyncStore>, serde_json::Value) {
        let path = scratch(name).join(RemoteSync::FILENAME);

        std::fs::write(&path, RELEASED).expect("the released record");

        let store = Persisted::<RemoteSyncStore>::load(path.clone()).expect("the load");
        let written: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).expect("the file"))
                .expect("the written record");

        (store, written)
    }

    /// **A record the current release wrote is converted in place at load, with nothing
    /// forgotten** (effort 851, requirement 16, criterion 16). The one organization becomes the
    /// list's only entry and the selected one; the Turso organization its consent is over moves
    /// into it, with the workspace it had open; every replica entry takes its id. The load
    /// commits the conversion at once, so the file says all of it.
    #[test]
    fn a_record_the_current_release_wrote_is_converted_in_place_with_nothing_forgotten() {
        let released: serde_json::Value = serde_json::from_str(RELEASED).expect("the fixture");
        let (_, written) = released_record_loaded("converted-released-record");

        let mut expected = released["organization"].clone();
        expected["tursoOrganization"] = released["tursoOrganization"].clone();
        expected["workspaceId"] = released["workspace"]["remoteId"].clone();
        expected["nameSigned"] = serde_json::Value::Bool(false);
        expected["nameSignedAt"] = serde_json::Value::from(0);
        expected["lockMarked"] = serde_json::Value::Bool(false);

        assert_eq!(
            written["heldOrganizations"],
            serde_json::Value::Array(vec![expected.clone()]),
            "the organization did not become the list's one entry: {written:#}"
        );
        assert_eq!(
            written["selectedOrganization"],
            released["organization"]["id"]
        );
        assert_eq!(
            written["organization"], expected,
            "the old key is not a copy of the selected entry"
        );
        assert!(
            written.get("organizations").is_none(),
            "the key older builds read as the shape they forget was written: {written:#}"
        );
        assert_eq!(
            written["tursoOrganization"], released["tursoOrganization"],
            "the top-level key is not a copy of the selected entry's Turso organization"
        );

        let replicas = written["replicas"].as_array().expect("the replicas");
        let released_replicas = released["replicas"].as_array().expect("the replicas");

        assert_eq!(
            replicas.len(),
            released_replicas.len(),
            "a replica was lost"
        );

        for (replica, before) in replicas.iter().zip(released_replicas) {
            assert_eq!(replica["organizationId"], released["organization"]["id"]);
            assert_eq!(replica["workspaceId"], before["workspaceId"]);
            assert_eq!(replica["memberId"], before["memberId"]);
            assert_eq!(replica["createdAt"], before["createdAt"]);
        }

        for kept in [
            "workspace",
            "deviceId",
            "startupPromptEnabled",
            "lastReachedAt",
        ] {
            assert_eq!(
                written[kept], released[kept],
                "`{kept}` changed in the conversion"
            );
        }
    }

    /// The organization as release 0.19.0 reads it: the fields it knows and nothing else, which
    /// is what a build the updater rolls back to makes of `organization`.
    #[derive(Debug, PartialEq, Eq, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct OrganizationAsTheReleaseReadsIt {
        id: String,
        name: String,
        verifying_key: String,
        remote_url: String,
        machine_id: String,
        member_id: Option<String>,
        role: Option<String>,
        joined_at: i64,
        format: Option<i64>,
        machine_signed_out: i64,
    }

    #[derive(Debug, PartialEq, Eq, serde::Deserialize)]
    struct TursoOrganizationAsTheReleaseReadsIt {
        slug: String,
        group: String,
    }

    #[derive(Debug, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RecordAsTheReleaseReadsIt {
        organization: Option<OrganizationAsTheReleaseReadsIt>,
        turso_organization: Option<TursoOrganizationAsTheReleaseReadsIt>,
    }

    /// **A build that knows only the old key finds the selected organization intact** in a
    /// converted record (effort 851, the plan's *The machine's record holds a list*): every field
    /// it reads is what it wrote, so a rollback lands the person on the organization they had,
    /// with the Turso organization its consent is over at the top where that build reads it.
    #[test]
    fn an_older_build_reading_a_converted_record_finds_the_selected_organization_intact() {
        let released: RecordAsTheReleaseReadsIt =
            serde_json::from_str(RELEASED).expect("the fixture");
        let (_, written) = released_record_loaded("converted-read-by-the-release");
        let read: RecordAsTheReleaseReadsIt =
            serde_json::from_value(written).expect("the release could not read the record");

        assert!(released.organization.is_some());
        assert_eq!(read.organization, released.organization);

        // and the Turso organization the owner's consent is over, where that build reads it, so a
        // rolled-back owner's machine still holds its Turso authority.
        assert!(released.turso_organization.is_some());
        assert_eq!(read.turso_organization, released.turso_organization);
    }

    /// The conversion through the record's own interface: one entry, selected, carrying the
    /// Turso organization and the workspace, and every replica of it.
    #[test]
    fn a_converted_record_holds_one_organization_selected_with_its_replicas() {
        let (store, _) = released_record_loaded("converted-through-the-interface");

        assert_eq!(store.held_organizations.len(), 1);

        let held = store.selected().expect("nothing selected");

        assert_eq!(held.id, "org-acme");
        assert_eq!(held.member_id.as_deref(), Some("mem-olivia"));
        assert_eq!(held.machine_signed_out, 3);
        assert_eq!(held.workspace_id.as_deref(), Some("wks-north"));
        assert_eq!(
            store
                .consent_organization(Some("org-acme"))
                .map(|it| it.slug.as_str()),
            Some("acme")
        );
        assert_eq!(store.pending_turso_organization, None);
        assert!(
            store
                .replicas
                .iter()
                .all(|replica| replica.organization_id == "org-acme")
        );
    }

    /// **The conversion happens once.** A converted record loads unchanged, and a record whose
    /// list was emptied stays empty: the copy under `organization` is never read back as an
    /// organization to hold, which is what would bring a forgotten one back.
    #[test]
    fn a_converted_record_is_not_converted_again_and_an_emptied_one_stays_empty() {
        let path = scratch("converted-once").join(RemoteSync::FILENAME);

        std::fs::write(&path, RELEASED).expect("the released record");

        let mut store = Persisted::<RemoteSyncStore>::load(path.clone()).expect("the load");
        let converted = std::fs::read_to_string(&path).expect("the file");

        drop(Persisted::<RemoteSyncStore>::load(path.clone()).expect("the second load"));

        assert_eq!(
            std::fs::read_to_string(&path).expect("the file"),
            converted,
            "a converted record changed on the next load"
        );

        store.held_organizations.clear();
        store.selected_organization = None;
        store.commit().expect("the commit");

        let reloaded = Persisted::<RemoteSyncStore>::load(path).expect("the reload");

        assert!(
            reloaded.held_organizations.is_empty(),
            "a forgotten organization came back"
        );
        assert_eq!(reloaded.selected(), None);
    }

    /// **A Turso organization a setup looked up before anything was held goes into the entry the
    /// setup records**, and is written under its own key until then, never at the top, which is
    /// the copy of the selected organization's older builds read.
    #[test]
    fn holding_a_consented_organization_takes_the_turso_organization_a_setup_looked_up() {
        let mut store = RemoteSyncStore::default();

        store.remember_consent_organization(
            None,
            crate::turso::discovery::TursoOrganization {
                slug: "acme".to_string(),
                group: "rentable".to_string(),
            },
        );

        let pending = serde_json::to_value(&store).expect("serialised");

        assert!(
            pending.get("tursoOrganization").is_none(),
            "a setup's Turso organization was written at the top: {pending:#}"
        );
        assert_eq!(pending["pendingTursoOrganization"]["slug"], "acme");

        store.hold_consented(super::HeldOrganization {
            id: "org-acme".to_string(),
            verifying_key: "k".to_string(),
            remote_url: "libsql://a".to_string(),
            ..Default::default()
        });

        assert_eq!(store.pending_turso_organization, None);
        assert_eq!(
            store
                .consent_organization(Some("org-acme"))
                .map(|it| it.slug.as_str()),
            Some("acme")
        );
        assert_eq!(store.consent_organization(None), None);
        assert_eq!(store.selected_organization.as_deref(), Some("org-acme"));

        let held = serde_json::to_value(&store).expect("serialised");

        assert_eq!(held["tursoOrganization"]["slug"], "acme", "{held:#}");
        assert_eq!(held["organization"]["tursoOrganization"]["slug"], "acme");
        assert!(
            held.get("pendingTursoOrganization").is_none(),
            "the create took the pending one and it is still written: {held:#}"
        );

        // and read back, the copy at the top is the entry's and not a setup's.
        let mut reread: RemoteSyncStore = serde_json::from_value(held).expect("read back");

        reread.sanitize();

        assert_eq!(reread.pending_turso_organization, None);
        assert_eq!(
            reread
                .consent_organization(Some("org-acme"))
                .map(|it| it.slug.as_str()),
            Some("acme")
        );
    }

    /// a Turso organization by its slug, in the group every setup makes.
    fn a_turso_organization(slug: &str) -> crate::turso::discovery::TursoOrganization {
        crate::turso::discovery::TursoOrganization {
            slug: slug.to_string(),
            group: "rentable".to_string(),
        }
    }

    /// **A setup interrupted by a restart keeps its Turso consent's details** (effort 851,
    /// requirement 39, criterion 39). The selected organization has a Turso organization of its
    /// own, which the top of the record mirrors for older builds; a consent granted for an added
    /// organization is over another, and it waits on the record under its own key for the create.
    /// A reload before the create finds it again, and the selected organization's is unchanged.
    ///
    /// Over two Turso organizations, and over the selected one's own, which is the owner setting up
    /// a second organization on the same Turso account: a pending one equal to the copy at the top
    /// is still pending.
    #[test]
    fn a_pending_consent_survives_a_reload_beside_the_selected_organizations_own() {
        for (name, pending) in [("pending-other", "beta"), ("pending-same", "acme")] {
            let path = scratch(name).join(RemoteSync::FILENAME);

            std::fs::write(
                &path,
                r#"{"heldOrganizations":[{"id":"org-acme","name":"Acme","verifyingKey":"k","remoteUrl":"libsql://a","tursoOrganization":{"slug":"acme","group":"rentable"}}],"selectedOrganization":"org-acme"}"#,
            )
            .expect("the record");

            let mut store = Persisted::<RemoteSyncStore>::load(path.clone()).expect("the load");

            store.remember_consent_organization(None, a_turso_organization(pending));
            store.commit().expect("the commit");

            let written: serde_json::Value =
                serde_json::from_str(&std::fs::read_to_string(&path).expect("the file"))
                    .expect("the written record");

            assert_eq!(
                written["tursoOrganization"]["slug"], "acme",
                "the top no longer mirrors the selected organization's for older builds: {written:#}"
            );
            assert!(
                written.get("organizations").is_none(),
                "the key older builds forget the machine over was written: {written:#}"
            );

            let reloaded = Persisted::<RemoteSyncStore>::load(path).expect("the reload");

            assert_eq!(
                reloaded.consent_organization(None),
                Some(&a_turso_organization(pending)),
                "the pending consent's Turso organization was lost over a restart ({name})"
            );
            assert_eq!(
                reloaded.consent_organization(Some("org-acme")),
                Some(&a_turso_organization("acme")),
                "the selected organization's own changed ({name})"
            );
            assert_eq!(reloaded.selected_organization.as_deref(), Some("org-acme"));
        }
    }

    /// **A record written before the pending consent had a key of its own still loads with its
    /// pending one**: there the top of the record carried it wherever the selected organization had
    /// no Turso organization of its own, or one that differs, and the load reads it from there.
    #[test]
    fn a_record_written_before_the_pending_key_keeps_its_pending_consent() {
        for (name, record) in [
            (
                "before-the-key-none-held",
                r#"{"tursoOrganization":{"slug":"beta","group":"rentable"}}"#,
            ),
            (
                "before-the-key-selected-has-none",
                r#"{"heldOrganizations":[{"id":"org-acme","name":"Acme","verifyingKey":"k","remoteUrl":"libsql://a"}],"selectedOrganization":"org-acme","tursoOrganization":{"slug":"beta","group":"rentable"}}"#,
            ),
        ] {
            let path = scratch(name).join(RemoteSync::FILENAME);

            std::fs::write(&path, record).expect("the record");

            let store = Persisted::<RemoteSyncStore>::load(path.clone()).expect("the load");

            assert_eq!(
                store.consent_organization(None),
                Some(&a_turso_organization("beta")),
                "{name}"
            );

            // and the load's commit wrote it under its own key, so the next load reads it there.
            let reloaded = Persisted::<RemoteSyncStore>::load(path).expect("the reload");

            assert_eq!(
                reloaded.consent_organization(None),
                Some(&a_turso_organization("beta")),
                "{name}"
            );
        }
    }

    /// **A rollback and a roll forward never give the selected organization a setup's Turso
    /// organization.** The selected organization has none of its own and a setup's waits; the
    /// record this build writes is read and written again by release 0.19.0, which keeps only the
    /// keys it knows, and the next load of this build converts what that release left. The
    /// converted organization has no Turso organization, and its consent is the one the launch
    /// moves, named by the conversion alone.
    #[test]
    fn a_rollback_and_a_roll_forward_lend_no_setups_turso_organization() {
        let path = scratch("rolled-back-and-forward").join(RemoteSync::FILENAME);

        std::fs::write(
            &path,
            r#"{"heldOrganizations":[{"id":"org-acme","name":"Acme","verifyingKey":"k","remoteUrl":"libsql://a"}],"selectedOrganization":"org-acme"}"#,
        )
        .expect("the record");

        let mut store = Persisted::<RemoteSyncStore>::load(path.clone()).expect("the load");

        store.remember_consent_organization(None, a_turso_organization("beta"));
        store.commit().expect("the commit");

        // release 0.19.0 reads the record and writes back the keys it knows, and no others.
        let written: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).expect("the file"))
                .expect("the written record");
        let released: serde_json::Map<String, serde_json::Value> = [
            "workspace",
            "startupPromptEnabled",
            "deviceId",
            "replicas",
            "tursoOrganization",
            "organization",
            "lastReachedAt",
        ]
        .into_iter()
        .filter_map(|key| Some((key.to_string(), written.get(key)?.clone())))
        .collect();

        std::fs::write(&path, serde_json::Value::Object(released).to_string())
            .expect("the release's write");

        let rolled_forward = Persisted::<RemoteSyncStore>::load(path).expect("the reload");

        assert_eq!(
            rolled_forward.selected_organization.as_deref(),
            Some("org-acme")
        );
        assert_eq!(
            rolled_forward.consent_organization(Some("org-acme")),
            None,
            "the selected organization took the setup's Turso organization"
        );
        assert_eq!(
            rolled_forward.consent_to_move.as_deref(),
            Some("org-acme"),
            "the conversion did not name the organization whose consent the launch moves"
        );
    }

    /// A selection naming nothing held selects the first organization held.
    #[test]
    fn a_selection_naming_nothing_held_selects_the_first() {
        let mut store: RemoteSyncStore = serde_json::from_str(
            r#"{"heldOrganizations":[{"id":"a","name":"Acme","verifyingKey":"k","remoteUrl":"libsql://a"},{"id":"b","name":"Beta","verifyingKey":"k","remoteUrl":"libsql://b"}],"selectedOrganization":"gone"}"#,
        )
        .expect("the record");

        store.sanitize();

        assert_eq!(store.selected().map(|held| held.id.as_str()), Some("a"));
    }

    fn a_remote_sync(name: &str) -> RemoteSync {
        a_remote_sync_at(scratch(name).join("store.json"))
    }

    /// the same, over a record at a path the test names, so it can be opened twice.
    fn a_remote_sync_at(path: PathBuf) -> RemoteSync {
        let settings = scratch("settings").join("settings.json");

        RemoteSync {
            database_path: Arc::new(RwLock::new(
                Persisted::<Settings>::load(settings).expect("settings"),
            )),
            store: Persisted::<RemoteSyncStore>::load(path).expect("store"),
            workspace_token: None,
            account_refusal: None,
            credential_refusal: None,
            unsendable_changes: None,
            unsendable_organization_changes: None,
            clock: crate::clock::System::shared(),
        }
    }

    /// **A held organization with an empty member id holds no member**, which is the one
    /// spelling of a machine that connected and has not signed in.
    #[test]
    fn an_empty_member_id_on_the_held_organization_reads_as_none() {
        let mut store: RemoteSyncStore = serde_json::from_str(
            r#"{"organization":{"id":"a","name":"Acme","verifyingKey":"k","remoteUrl":"libsql://a","memberId":"","role":"","joinedAt":1}}"#,
        )
        .expect("the record");

        store.sanitize();

        let held = store
            .selected()
            .cloned()
            .expect("the organization was dropped");

        assert_eq!(held.member_id, None);
        assert_eq!(held.role, None);
    }

    /// **A role an earlier build recorded that is no kind of role reads as none, and a kind reads
    /// as itself** (effort 838, ticket 15). The record kept the word a session spoke, and the
    /// word is gone; the member id stays, so the machine still knows who signed in on it, and the
    /// next sign-in records their role's kind.
    #[test]
    fn a_role_word_an_earlier_build_recorded_reads_as_none_and_a_kind_reads_as_itself() {
        let read = |role: &str| {
            let mut store: RemoteSyncStore = serde_json::from_str(&format!(
                r#"{{"organization":{{"id":"a","name":"Acme","verifyingKey":"k","remoteUrl":"libsql://a","memberId":"me","role":"{role}","joinedAt":1}}}}"#
            ))
            .expect("the record");

            store.sanitize();

            store
                .selected()
                .cloned()
                .expect("the organization was dropped")
        };

        let removed = read("removed");

        assert_eq!(removed.role, None);
        assert_eq!(removed.member_id.as_deref(), Some("me"));

        for kind in ["owner", "manager", "member", "custom"] {
            assert_eq!(read(kind).role.as_deref(), Some(kind));
        }
    }

    /// **A record cut short comes back from its last good copy with every organization it held**
    /// (effort 854, criterion 17). The record is what this machine knows of the organizations it
    /// holds, and starting from the defaults would forget them; the damaged file is kept beside it.
    #[test]
    fn a_truncated_record_comes_back_holding_both_organizations_from_its_copy() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = scratch("remote-sync-recovers-from-copy");
                let path = root.join(RemoteSync::FILENAME);
                let held = r#"{"heldOrganizations":[{"id":"a","name":"Acme","verifyingKey":"k","remoteUrl":"libsql://a"},{"id":"b","name":"Beta","verifyingKey":"k","remoteUrl":"libsql://b"}],"selectedOrganization":"a"}"#;

                std::fs::write(&path, &held[..40]).expect("the truncated record");
                std::fs::write(root.join("remote-sync.json.bak"), held).expect("the copy");

                let settings = Arc::new(RwLock::new(
                    Persisted::<Settings>::load(root.join(Settings::FILENAME)).expect("settings"),
                ));
                let mut remote_sync = RemoteSync::new(
                    settings,
                    path.clone(),
                    crate::clock::Fixed::shared(1_700_000_000_000),
                )
                .await
                .expect("a truncated record stopped the launch");

                let ids = remote_sync
                    .store_mut()
                    .held_organizations
                    .iter()
                    .map(|held| held.id.clone())
                    .collect::<Vec<_>>();

                assert_eq!(ids, ["a", "b"], "an organization was forgotten");
                assert_eq!(
                    std::fs::read_to_string(root.join("remote-sync.json.corrupt-1700000000000"))
                        .expect("the damaged record was not kept"),
                    &held[..40]
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    /// **A `remote-sync.json` that cannot be written at launch is named** (effort 854, ticket
    /// 38): the reconcile fills in this machine's device and commits, and a failure there is shown
    /// as one to open the file is. A directory where the commit stages its write makes it fail.
    #[test]
    fn a_record_that_cannot_be_written_at_launch_is_named() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = scratch("remote-sync-unwritable-at-launch");
                let path = root.join(RemoteSync::FILENAME);
                Persisted::<RemoteSyncStore>::load(path.clone()).expect("the record");
                std::fs::create_dir(root.join("remote-sync.json.tmp"))
                    .expect("the blocked staging file");

                let settings = Arc::new(RwLock::new(
                    Persisted::<Settings>::load(root.join(Settings::FILENAME)).expect("settings"),
                ));
                let error = match RemoteSync::new(
                    settings,
                    path.clone(),
                    crate::clock::Fixed::shared(1_700_000_000_000),
                )
                .await
                {
                    Ok(_) => panic!("a record that could not be written was opened"),
                    Err(error) => error,
                };

                assert_eq!(
                    crate::persisted::unopenable_record(&error.to_string()),
                    Some(path.as_path()),
                    "the launch cannot name the file: {error}"
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    /// **A record whose file has gone comes back from its last good copy with every organization
    /// it held** (effort 854, ticket 29). Started from the defaults, its first commit would write
    /// them over the copy too, and the machine would hold nothing.
    #[test]
    fn a_missing_record_comes_back_holding_both_organizations_from_its_copy() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = scratch("remote-sync-missing-recovers-from-copy");
                let path = root.join(RemoteSync::FILENAME);
                let held = r#"{"heldOrganizations":[{"id":"a","name":"Acme","verifyingKey":"k","remoteUrl":"libsql://a"},{"id":"b","name":"Beta","verifyingKey":"k","remoteUrl":"libsql://b"}],"selectedOrganization":"a"}"#;

                std::fs::write(root.join("remote-sync.json.bak"), held).expect("the copy");

                let settings = Arc::new(RwLock::new(
                    Persisted::<Settings>::load(root.join(Settings::FILENAME)).expect("settings"),
                ));
                let mut remote_sync = RemoteSync::new(
                    settings,
                    path.clone(),
                    crate::clock::Fixed::shared(1_700_000_000_000),
                )
                .await
                .expect("a missing record stopped the launch");

                let ids = remote_sync
                    .store_mut()
                    .held_organizations
                    .iter()
                    .map(|held| held.id.clone())
                    .collect::<Vec<_>>();

                assert_eq!(ids, ["a", "b"], "an organization was forgotten");

                let copy: serde_json::Value = serde_json::from_slice(
                    &std::fs::read(root.join("remote-sync.json.bak")).expect("the copy is gone"),
                )
                .expect("the copy");

                assert_eq!(
                    copy["heldOrganizations"].as_array().map(Vec::len),
                    Some(2),
                    "the copy was written over"
                );

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    /// a machine that has never kept a record, with no copy either, starts from the defaults.
    #[test]
    fn a_missing_record_with_no_copy_starts_holding_nothing() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = scratch("remote-sync-missing-no-copy");
                let path = root.join(RemoteSync::FILENAME);

                let settings = Arc::new(RwLock::new(
                    Persisted::<Settings>::load(root.join(Settings::FILENAME)).expect("settings"),
                ));
                let mut remote_sync = RemoteSync::new(
                    settings,
                    path.clone(),
                    crate::clock::Fixed::shared(1_700_000_000_000),
                )
                .await
                .expect("a first launch stopped");

                assert!(remote_sync.store_mut().held_organizations.is_empty());
                assert!(path.exists(), "the record was not written");

                let _ = std::fs::remove_dir_all(&root);
            });
    }

    #[test]
    fn initializes_default_workspace_from_managed_database_path() {
        Runtime::new()
            .expect("failed to create tokio runtime")
            .block_on(async {
                let root = scratch("remote-sync-default-profile");
                std::fs::create_dir_all(&root).expect("failed to create test root");

                let settings_path = root.join(Settings::FILENAME);
                let mut settings =
                    Persisted::<Settings>::load(settings_path).expect("failed to load settings");
                settings.database_path = root.join("app.db");
                settings.commit().expect("failed to commit settings");

                let settings = Arc::new(RwLock::new(settings));
                let mut remote_sync = RemoteSync::new(
                    settings,
                    root.join(RemoteSync::FILENAME),
                    crate::clock::System::shared(),
                )
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
                let root = scratch("remote-sync-reconcile-path-change");
                std::fs::create_dir_all(&root).expect("failed to create test root");

                let settings_path = root.join(Settings::FILENAME);
                let mut settings =
                    Persisted::<Settings>::load(settings_path).expect("failed to load settings");
                settings.database_path = root.join("first.db");
                settings.commit().expect("failed to commit settings");

                let settings = Arc::new(RwLock::new(settings));
                let mut remote_sync = RemoteSync::new(
                    settings.clone(),
                    root.join(RemoteSync::FILENAME),
                    crate::clock::System::shared(),
                )
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

    /// The memo over Turso's lookup, moved here from `turso/discovery/` with the function; the
    /// scripted replies are that module's own.
    mod consented {
        use serde_json::json;

        use crate::{
            persisted::Persisted,
            sync::test::server::{ScriptedResponse, ScriptedServer},
            turso::discovery::{ConsentedGroup, McpEndpoint, TursoOrganization},
        };

        use super::super::{RemoteSyncStore, consented_organization};
        use crate::test::scratch;

        const TOKEN: &str = "the-platform-api-token";

        /// what `initialize` answers, which this module reads nothing out of but the session header.
        fn handshake() -> ScriptedResponse {
            ScriptedResponse::new(
                200,
                json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "result": {
                        "protocolVersion": "2025-06-18",
                        "capabilities": {},
                        "serverInfo": { "name": "turso-cloud-mcp", "version": "0.1.0" }
                    }
                })
                .to_string(),
            )
        }

        /// `list_databases` as it answered on 2026-08-30: the records inside a text part.
        fn listing(records: serde_json::Value) -> ScriptedResponse {
            ScriptedResponse::new(
                200,
                json!({
                    "jsonrpc": "2.0",
                    "id": 2,
                    "result": {
                        "content": [{ "type": "text", "text": records.to_string() }]
                    }
                })
                .to_string(),
            )
        }

        /// A store on disk, so the remembering is the real thing rather than a field in a test.
        fn load_store(directory: &std::path::Path) -> Persisted<RemoteSyncStore> {
            Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
                .expect("the store could not be loaded")
        }

        /// Criterion 4: the slug is stored locally and a second provisioning call asks nothing.
        #[tokio::test]
        async fn the_second_call_reads_the_store_and_makes_no_request() {
            let directory = scratch("discovery-remembers");
            let mut store = load_store(&directory);

            let server = ScriptedServer::start(vec![
                handshake(),
                listing(json!([{
                    "Name": "ledger",
                    "hostname": "ledger-acme.aws-us-east-1.turso.io",
                    "group": "rents"
                }])),
            ])
            .await;
            let endpoint = McpEndpoint::at(&server.url(""));

            let first = consented_organization(&mut store, None, TOKEN, &endpoint)
                .await
                .expect("the first lookup failed");
            let after_first = server.request_count();

            let second = consented_organization(&mut store, None, TOKEN, &endpoint)
                .await
                .expect("the second lookup failed");

            assert_eq!(
                first,
                Some(ConsentedGroup {
                    organization: TursoOrganization {
                        slug: "acme".to_string(),
                        group: "rents".to_string(),
                    },
                    // the listing was read, so what the group holds is reported.
                    databases: Some(vec!["ledger".to_string()]),
                })
            );
            assert_eq!(
                second,
                Some(ConsentedGroup {
                    organization: TursoOrganization {
                        slug: "acme".to_string(),
                        group: "rents".to_string(),
                    },
                    // and the second call asked nothing, so it has no listing to report rather
                    // than an empty one, which would read as a group holding nothing.
                    databases: None,
                })
            );
            assert_eq!(
                server.request_count(),
                after_first,
                "a second provisioning call reached the mcp server"
            );

            // and it survives the process, which is what makes it storage rather than a cache.
            let reopened = load_store(&directory);
            assert_eq!(
                reopened
                    .pending_turso_organization
                    .as_ref()
                    .map(|it| it.slug.as_str()),
                Some("acme")
            );
        }

        /// **What one organization's consent is over is never another's answer** (effort 851,
        /// requirement 14). A machine holding an organization whose consent is over `acme` asks
        /// again for the pending consent of the next, which is over `beta`, and remembers each
        /// where it belongs.
        #[tokio::test]
        async fn one_organizations_consent_is_never_read_as_anothers() {
            let directory = scratch("discovery-per-organization");
            let mut store = load_store(&directory);

            store.hold(super::super::HeldOrganization {
                id: "org-a".to_string(),
                verifying_key: "k".to_string(),
                remote_url: "libsql://a".to_string(),
                turso_organization: Some(TursoOrganization {
                    slug: "acme".to_string(),
                    group: "rents".to_string(),
                }),
                ..Default::default()
            });
            store.commit().expect("the commit");

            let server = ScriptedServer::start(vec![
                handshake(),
                listing(json!([{
                    "Name": "ledger",
                    "hostname": "ledger-beta.aws-us-east-1.turso.io",
                    "group": "beta-group"
                }])),
            ])
            .await;
            let endpoint = McpEndpoint::at(&server.url(""));

            let held = consented_organization(&mut store, Some("org-a"), TOKEN, &endpoint)
                .await
                .expect("the held organization's lookup failed")
                .expect("the held organization's consent was not remembered");

            assert_eq!(held.organization.slug, "acme");
            assert_eq!(
                server.request_count(),
                0,
                "a remembered answer was asked again"
            );

            let pending = consented_organization(&mut store, None, TOKEN, &endpoint)
                .await
                .expect("the pending lookup failed")
                .expect("the pending consent's group holds a database");

            assert_eq!(
                pending.organization.slug, "beta",
                "the pending consent was answered with another organization's account"
            );
            assert!(
                server.request_count() > 0,
                "the pending consent was not asked about"
            );
            assert_eq!(
                store
                    .consent_organization(Some("org-a"))
                    .map(|it| it.slug.as_str()),
                Some("acme"),
                "the held organization's account was overwritten"
            );
            assert_eq!(
                store.consent_organization(None).map(|it| it.slug.as_str()),
                Some("beta")
            );
        }

        /// An empty group is remembered as nothing, so the next run asks again rather than believing
        /// the account has no organization.
        #[tokio::test]
        async fn an_empty_group_is_not_remembered_as_an_answer() {
            let directory = scratch("discovery-empty-group");
            let mut store = load_store(&directory);

            let server = ScriptedServer::start(vec![handshake(), listing(json!([]))]).await;

            let found =
                consented_organization(&mut store, None, TOKEN, &McpEndpoint::at(&server.url("")))
                    .await
                    .expect("an empty group was reported as a failure");

            assert_eq!(found, None);
            assert_eq!(store.pending_turso_organization, None);
        }
    }

    /// Effort 851, the review of requirement 35: **an entry latches each member's own lock
    /// beside the others**, and an entry an earlier build of the effort wrote with one member's id
    /// reads as a list of that one. An entry latching nobody writes no field at all.
    #[test]
    fn an_entry_latches_each_member_and_reads_the_single_id_it_once_wrote() {
        let one: super::HeldOrganization =
            serde_json::from_str(r#"{"id":"org","ownLockLatched":"sami"}"#).expect("the entry");

        assert_eq!(one.own_lock_latched, vec!["sami".to_string()]);

        let none: super::HeldOrganization =
            serde_json::from_str(r#"{"id":"org"}"#).expect("the entry");

        assert!(none.own_lock_latched.is_empty());
        assert!(
            !serde_json::to_string(&none)
                .expect("the entry")
                .contains("ownLockLatched")
        );

        let two = one.latching("noor").latching("sami");
        let read: super::HeldOrganization =
            serde_json::from_str(&serde_json::to_string(&two).expect("the entry"))
                .expect("the entry");

        assert_eq!(
            read.own_lock_latched,
            vec!["sami".to_string(), "noor".to_string()]
        );
        assert!(read.latches("sami") && read.latches("noor") && !read.latches("olivia"));
    }
}
