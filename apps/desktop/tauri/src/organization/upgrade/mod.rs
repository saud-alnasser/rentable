//! the explicit upgrade of the organization or of one workspace (effort 857, requirements 3 and 5,
//! ticket 07): what it would change and whom it would stop, and running it.
//!
//! **An upgrade declared after effort 857 never runs on open** (`database/step.rs`): it can stop
//! somebody, so it waits for somebody holding `upgradeData` to choose it, having seen who it
//! stops. [`preview_workspace`] and [`preview_organization`] answer that: the steps it would run,
//! each by the key of the sentence saying what it adds or changes, and every machine it would stop
//! or make read-only, read off the organization's `machine_version` rows and `machine.seen_at`.
//! A machine seen within [`MACHINE_PRESENCE_WINDOW`] is listed as stopped or read-only, and one not
//! seen since is listed apart with the date it was; a machine that has never recorded what it runs
//! is on an unknown version, a build before 857, and is stopped by any upgrade that moves the
//! number those builds read.
//!
//! **The steps waiting are the ones whose floors are not reached** ([`Steps::awaiting`]): an
//! upgrade that has run took the floors to what it declares, and the organization keeps no list
//! of the steps it took.
//!
//! **Running it is whole or nothing, under the lease** (requirement 5), and keeps what effort 838
//! established for every change of shape: the lease taken at the organization's primary, a copy
//! taken before the first write, the steps and their records in one transaction checked against
//! a fresh database before it commits, and a refusal before anything is written. For a workspace
//! that is [`apply::bring_up_selected`] running every step the workspace has not run; for the
//! organization it is one transaction on its replica running each change of format through the
//! caller's `work`, which production hands the session's upgrade port. Each records its floors,
//! inside the workspace and in the organization, and moves the number builds before 857 read only
//! where a floor now passes what they know ([`Steps::legacy_after`]).
//!
//! **Who may**: whoever holds `upgradeData` on their verified row ([`gate`]), which the owner
//! always does, a manager does by default and a member does not; and before the owner has opened
//! this version, nobody but the owner, since until then no certificate in the organization carries
//! the flag. A step that needs the owner's own key is the owner's whoever else holds it.

mod command;

pub(crate) use command::*;

use std::future::Future;

use serde::{Deserialize, Serialize};

use crate::{
    backup,
    database::{
        floor::{self, Floors, Standing},
        step::Steps,
    },
    diagnostics,
    error::{Error, RefusalReason},
    schema,
    turso::platform::{AccessLevel, TursoPlatform},
};

use super::{
    lease::{
        self, LeaseAuthority, LeaseOutcome, MIGRATION_LEASE_LIFETIME_MS,
        apply::{self, Migrations, Selected},
    },
    member::vault::ContentKey,
    ownership::refuse_until_the_owner_has_opened_this_version,
    role::{
        in_one_transaction,
        permission::{self, Flag},
    },
    session::{
        MemberSession, WorkspaceCredential, WorkspaceFacts, acting_row, opened, opened_name,
    },
    setup::ORGANIZATION_DATABASE_PREFIX,
    store::{
        MACHINE_PRESENCE_WINDOW, MachineRecord, MachineVersionRecord, MemberRecord,
        OrganizationStore, TABLES, waits_for_its_owner,
    },
    workspace::{self, remote::OverThePipeline, remote::Pipeline},
};

/// The key the organization's own lease is taken under in `migration_lease`, beside the
/// workspaces' ids: one upgrade of the organization at a time, as one of each workspace.
pub const ORGANIZATION_LEASE: &str = "organization";

/// What is upgraded: the organization, or one workspace by its id. Crosses as `"organization"` or
/// `{ "workspace": id }`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Target {
    Organization,
    Workspace(String),
}

/// One step the upgrade would run, by the key of the sentence that says what it adds or changes,
/// under `organization.upgrade.steps` in both locales.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepFacts {
    pub describes: String,
}

/// One machine the upgrade would stop or make read-only.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Machine {
    /// the username of the member signed in on it, opened with the content key; `None` on a
    /// machine nobody is signed in on.
    pub member: Option<String>,
    /// what its operating system calls it, where it has said; `None` on one that has not.
    pub name: Option<String>,
    /// the version of rentable it runs, as its `machine_version` row says; `None` on a machine
    /// that has never recorded it, which is a build before effort 857: an unknown version.
    pub rentable: Option<String>,
    /// when it last said it was here, in milliseconds since the epoch.
    pub seen_at: i64,
}

/// What an upgrade would do, for whoever is about to choose it (spec requirement 3).
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    /// the steps it would run, in order; none where nothing waits.
    pub steps: Vec<StepFacts>,
    /// the machines seen within seven days it would stop: below the read floor it raises.
    pub stopped: Vec<Machine>,
    /// the machines seen within seven days it would make read-only: below the write floor alone.
    pub read_only: Vec<Machine>,
    /// the machines it would stop or make read-only that were not seen within seven days, each
    /// with the date it last was.
    pub unseen: Vec<Machine>,
    /// whether a step needs the owner's own key, so the upgrade waits for the owner whoever holds
    /// the permission.
    pub needs_owner: bool,
}

/// The refusal of an upgrade holding a step that needs the owner's own key, asked by anybody else.
pub(crate) fn needs_the_owner() -> Error {
    Error::refused(
        RefusalReason::UpgradeNeedsOwner,
        "the upgrade holds a step that needs the owner's own key, so only the owner can run it; \
         nothing was changed",
    )
}

/// The refusal of an upgrade while another member holds the lease.
fn under_way(holder: &str, until: i64) -> Error {
    Error::refused(
        RefusalReason::UpgradeUnderWay,
        format!(
            "{holder} holds the lease until {until} and is bringing it up now. try again once they \
             have finished; nothing was changed"
        ),
    )
}

/// Who may upgrade (spec requirement 3), off the acting member's verified row: whoever holds
/// `upgradeData`, and before the owner has opened this version nobody but the owner, since no
/// certificate carries the flag until they have (ticket 15). Answers whether they are the owner,
/// which a step needing the owner's key asks.
async fn gate(store: &OrganizationStore, session: &MemberSession) -> Result<bool, Error> {
    session.settled()?;

    let row = acting_row(store, session).await?;
    let owner = row.role_id == permission::OWNER;

    if !owner {
        refuse_until_the_owner_has_opened_this_version(store, &session.verifying_key).await?;
    }

    permission::require(row.effective, Flag::UpgradeData)?;

    Ok(owner)
}

/// The workspace `workspace_id` as the member holds it, or `NoGrant`.
async fn held_workspace(
    store: &OrganizationStore,
    session: &MemberSession,
    workspace_id: &str,
) -> Result<(WorkspaceFacts, WorkspaceCredential), Error> {
    let workspaces = store.workspaces(&session.verifying_key).await?;

    workspace::openable(session, &workspaces, &[], workspace_id)?.ok_or_else(|| {
        Error::refused(
            RefusalReason::NoGrant,
            "you hold no grant on that workspace",
        )
    })
}

/// The floors `steps` take `before` to once every step waiting has run, and those steps.
fn after_awaiting(steps: &Steps, before: Floors) -> (Vec<u32>, Floors) {
    let awaiting = steps.awaiting(before);
    let level = awaiting.iter().copied().max().unwrap_or(before.level);

    (awaiting.clone(), steps.raised(before, &awaiting, level))
}

/// What the upgrade of the workspace `workspace_id` would run, and whom it would stop or make
/// read-only: the machines of the members holding a grant on it. `migrations` is the ladder this
/// build ships ([`apply::SHIPPED`]), or a test's own.
pub async fn preview_workspace(
    store: &OrganizationStore,
    session: &MemberSession,
    workspace_id: &str,
    migrations: &Migrations,
    now: i64,
) -> Result<Preview, Error> {
    gate(store, session).await?;

    let (facts, _) = held_workspace(store, session, workspace_id).await?;
    let before = lease::recorded_floors(store, &facts.id, facts.schema_version).await?;
    let steps = &migrations.steps;
    let (awaiting, after) = after_awaiting(steps, before);
    let legacy = floor::number(facts.schema_version)?;
    let holders: Vec<String> = store
        .grants(&session.verifying_key)
        .await?
        .into_iter()
        .filter(|grant| grant.workspace_id == facts.id)
        .map(|grant| grant.member_id)
        .collect();

    previewed(
        store,
        session,
        steps,
        &awaiting,
        Judged {
            before,
            after,
            moves_legacy: steps.legacy_after(legacy, after) != legacy,
            known_of: |row| row.workspace_known,
            counts: &|machine| {
                machine
                    .member_id
                    .as_ref()
                    .is_some_and(|member| holders.contains(member))
            },
        },
        now,
    )
    .await
}

/// What the upgrade of the organization would run, and whom it would stop or make read-only:
/// every machine in its registry.
pub async fn preview_organization(
    store: &OrganizationStore,
    session: &MemberSession,
    now: i64,
) -> Result<Preview, Error> {
    gate(store, session).await?;

    let steps = store.format_steps();
    let before = store.floors().await?.ok_or_else(waits_for_its_owner)?;
    let (awaiting, after) = after_awaiting(&steps, before);
    let legacy = floor::number(store.format().await?.unwrap_or(i64::from(steps.settled())))?;

    previewed(
        store,
        session,
        &steps,
        &awaiting,
        Judged {
            before,
            after,
            moves_legacy: steps.legacy_after(legacy, after) != legacy,
            known_of: |row| row.format_known,
            counts: &|_| true,
        },
        now,
    )
    .await
}

/// How a preview judges one machine: the floors before and after, whether the number builds
/// before 857 read moves, which ladder's step a machine's row says it knows, and which machines
/// the upgrade reaches.
struct Judged<'a> {
    before: Floors,
    after: Floors,
    moves_legacy: bool,
    known_of: fn(&MachineVersionRecord) -> u32,
    counts: &'a (dyn Fn(&MachineRecord) -> bool + Sync),
}

impl Judged<'_> {
    /// Where the upgrade leaves a machine whose row is `version`, where that is worse than where it
    /// stands now: `None` for one it leaves as it was. A machine with no row runs a build before
    /// 857, which only a moved legacy number stops.
    fn worsened(&self, version: Option<&MachineVersionRecord>) -> Option<Standing> {
        match version {
            Some(row) => {
                let known = (self.known_of)(row);
                let after = self.after.standing(known);

                (after != self.before.standing(known) && after != Standing::Writable)
                    .then_some(after)
            }
            None => self.moves_legacy.then_some(Standing::Unreadable),
        }
    }
}

/// The preview of the steps `awaiting` of `steps`, with every machine `judged` reaches sorted by
/// where the upgrade leaves it and whether it was seen within the window.
async fn previewed(
    store: &OrganizationStore,
    session: &MemberSession,
    steps: &Steps,
    awaiting: &[u32],
    judged: Judged<'_>,
    now: i64,
) -> Result<Preview, Error> {
    let mut preview = Preview {
        steps: awaiting
            .iter()
            .filter_map(|number| steps.step(*number))
            .map(|step| StepFacts {
                describes: step.describes.to_string(),
            })
            .collect(),
        needs_owner: steps.need_the_owner(awaiting),
        ..Preview::default()
    };

    if awaiting.is_empty() {
        return Ok(preview);
    }

    let members = store.members(&session.verifying_key).await?;
    let names = store.machine_names().await?;

    for machine in store.machines().await? {
        // this machine runs the build that knows every step, and nothing it would stop.
        if machine.id == session.machine_id || !(judged.counts)(&machine) {
            continue;
        }

        let version = store.machine_version(&machine.id).await?;
        let Some(standing) = judged.worsened(version.as_ref()) else {
            continue;
        };
        let seen = machine.seen_at > now - MACHINE_PRESENCE_WINDOW && machine.seen_at <= now;
        let listed = Machine {
            member: member_named(&session.content_key, &members, machine.member_id.as_deref()),
            name: opened_name(
                &session.content_key,
                names
                    .iter()
                    .find(|row| row.id == machine.id)
                    .and_then(|row| row.name_sealed.as_deref()),
            ),
            rentable: version.map(|row| row.rentable),
            seen_at: machine.seen_at,
        };

        match (seen, standing) {
            (false, _) => preview.unseen.push(listed),
            (true, Standing::Unreadable) => preview.stopped.push(listed),
            (true, _) => preview.read_only.push(listed),
        }
    }

    Ok(preview)
}

/// The username of the member `member_id` names, opened with the content key, where it opens.
fn member_named(
    content_key: &ContentKey,
    members: &[MemberRecord],
    member_id: Option<&str>,
) -> Option<String> {
    let member = members
        .iter()
        .find(|member| Some(member.id.as_str()) == member_id)?;

    opened(
        content_key,
        "member.username_sealed",
        &member.username_sealed,
    )
    .ok()
}

/// What running the upgrade of a workspace is handed: the organization and the member running it,
/// the workspace by its id, where a database's hostname takes statements, and the owner's Turso
/// account where this machine holds it, which the copy is made on too.
pub struct Running<'a, P> {
    pub store: &'a OrganizationStore,
    pub session: &'a MemberSession,
    pub workspace_id: &'a str,
    pub pipeline_of: &'a (dyn Fn(&str) -> Pipeline + Sync),
    /// `None` on a member's machine, which makes the copy on this machine alone.
    pub account: Option<&'a P>,
}

/// Run the upgrade of a workspace (spec requirements 3 and 5): every step of `migrations` the
/// workspace has not run, the upgrades waiting for this act among them, under the lease, after a
/// copy, in one transaction with the check against a fresh database and the workspace's own
/// records (`data_floor`, `applied_step`, its version), or not at all. Then the organization's
/// record of it: `workspace_floor`, and `workspace.schema_version`, which follows the steps
/// shipped before 857 as it always has and otherwise moves only where a floor now stops every
/// build before 857 ([`Steps::legacy_after`]).
///
/// **Refused before anything is written**: by the [`gate`], for a step needing the owner's key
/// asked by anybody else, for a read-only grant, for a workspace this build may not write, and
/// while another member holds the lease. A copy that cannot be taken, or a step or the check
/// failing, releases the lease and leaves the workspace and its records exactly as they were,
/// with whatever copy was taken kept.
pub async fn run_workspace<L, P>(
    running: Running<'_, P>,
    lease: &L,
    migrations: &Migrations,
    now: impl Fn() -> i64,
) -> Result<(), Error>
where
    L: LeaseAuthority,
    P: TursoPlatform,
{
    let Running {
        store,
        session,
        workspace_id,
        pipeline_of,
        account,
    } = running;
    let owner = gate(store, session).await?;
    let (facts, held) = held_workspace(store, session, workspace_id).await?;

    if held.access != AccessLevel::FullAccess {
        return Err(Error::refused(
            RefusalReason::WorkspaceBehind,
            format!(
                "{} is upgraded over full access, and read-only access cannot do it; nothing was \
                 changed",
                facts.name
            ),
        ));
    }

    let steps = &migrations.steps;
    let before = lease::recorded_floors(store, &facts.id, facts.schema_version).await?;

    match before.standing(steps.known()) {
        Standing::Writable => {}
        Standing::Unreadable => {
            return Err(lease::newer(
                &facts.name,
                facts.schema_version,
                i64::from(steps.known()),
            ));
        }
        Standing::ReadOnly => {
            return Err(Error::refused(
                RefusalReason::WorkspaceReadOnlyByVersion,
                format!(
                    "{} was upgraded by a newer rentable, which this one may read but not write; \
                 nothing was changed",
                    facts.name
                ),
            ));
        }
    }

    let awaiting = steps.awaiting(before);

    if steps.need_the_owner(&awaiting) && !owner {
        return Err(needs_the_owner());
    }

    if awaiting.is_empty() && !lease::is_pending_over(migrations, store, &facts).await? {
        return Ok(());
    }

    let taken_at = now();
    let holder = &session.member_id;

    if let LeaseOutcome::HeldBy {
        holder_member_id,
        until,
    } = lease
        .take(
            &facts.id,
            holder,
            taken_at + MIGRATION_LEASE_LIFETIME_MS,
            taken_at,
        )
        .await?
    {
        return Err(under_way(&holder_member_id, until));
    }

    let ran = upgraded_workspace(
        store,
        session,
        &facts,
        &held,
        &pipeline_of(&facts.database_hostname),
        account,
        migrations,
        owner,
        taken_at,
        &now,
    )
    .await;

    // the lease goes whatever came of it: a failure was rolled back whole and is somebody's to try
    // again, and a success has recorded everything it moved.
    if let Err(error) = lease.release(&facts.id, holder).await {
        diagnostics::warn("organization.upgrade.releaseFailed")
            .with("workspace", facts.id.as_str())
            .with("error", error.to_string().as_str())
            .write();
    }

    ran
}

/// The copy, the steps and the records of [`run_workspace`], under the lease it holds.
#[allow(clippy::too_many_arguments)]
async fn upgraded_workspace<P: TursoPlatform>(
    store: &OrganizationStore,
    session: &MemberSession,
    facts: &WorkspaceFacts,
    held: &WorkspaceCredential,
    pipeline: &Pipeline,
    account: Option<&P>,
    migrations: &Migrations,
    owner: bool,
    taken_at: i64,
    now: &impl Fn() -> i64,
) -> Result<(), Error> {
    let steps = &migrations.steps;
    let level = lease::recorded_floors(store, &facts.id, facts.schema_version)
        .await?
        .level
        .max(floor::number(facts.schema_version)?);
    let label = format!("schema-{level}-to-{}", steps.known());

    backup::local_copy(
        &OverThePipeline::new(pipeline, &held.token),
        store.directory(),
        &facts.database_name,
        &label,
        taken_at,
    )
    .await?;

    if let Some(account) = account
        && !backup::remote_copy_made(store.directory(), &facts.database_name, &label)
        && let Ok(name) = backup::remote_copy(account, &facts.database_name, &label, taken_at).await
    {
        backup::remember_remote_copy(store.directory(), &facts.database_name, &label, &name);
    }

    let brought = apply::bring_up_selected(
        pipeline,
        &held.token,
        migrations,
        usize::try_from(facts.schema_version).unwrap_or_default(),
        now(),
        Selected::Every { owner },
    )
    .await?;

    diagnostics::info("organization.upgrade.workspace")
        .with("workspace", facts.id.as_str())
        .with("member", session.member_id.as_str())
        .with(
            "steps",
            brought
                .ran
                .iter()
                .map(u32::to_string)
                .collect::<Vec<String>>()
                .join(",")
                .as_str(),
        )
        .write();

    // the number builds before 857 read follows the steps shipped before 857, as opening moves
    // it, and past that only where a floor now stops every one of those builds.
    let recorded = floor::number(facts.schema_version)?;
    let followed = recorded.max(brought.version.min(steps.settled()));
    let legacy = brought
        .floors
        .map_or(followed, |floors| steps.legacy_after(followed, floors));

    if legacy != recorded {
        store
            .record_schema_version(&facts.id, i64::from(legacy), now())
            .await?;
    }

    if let Some(floors) = brought.floors
        && store.workspace_floor(&facts.id).await? != Some(floors)
    {
        store
            .record_workspace_floor(&facts.id, floors, now())
            .await?;
    }

    if !store.push().await {
        diagnostics::warn("organization.upgrade.notYetSent")
            .with("workspace", facts.id.as_str())
            .write();
    }

    Ok(())
}

/// Run the upgrade of the organization (spec requirements 3 and 5): every change of format
/// waiting for this act, each through `work`, under the organization's lease, after a copy, in
/// one transaction on the replica with its floors in `organization_floor` and the check against a
/// fresh organization of this build, or not at all; then a push. The `format` row, which builds
/// before 857 read, moves only where a floor now stops every one of them ([`Steps::legacy_after`]).
///
/// `work` runs the change of format numbered by its argument inside the transaction: production
/// hands it the session's upgrade port (`session::Upgrade::change`), and a test its own.
///
/// **Refused before anything is written**, as [`run_workspace`] is: by the [`gate`], for a step
/// needing the owner's key asked by anybody else, for an organization this build may not write,
/// and while another member holds the lease. A copy that cannot be taken, or a change or the check
/// failing, releases the lease and leaves the organization exactly as it was.
pub async fn run_organization<L, P, W, F>(
    store: &OrganizationStore,
    session: &MemberSession,
    lease: &L,
    account: Option<&P>,
    work: W,
    now: impl Fn() -> i64,
) -> Result<(), Error>
where
    L: LeaseAuthority,
    P: TursoPlatform,
    W: Fn(u32) -> F,
    F: Future<Output = Result<(), Error>>,
{
    let owner = gate(store, session).await?;

    if store.refuse_another_format().await? != Standing::Writable {
        return Err(Error::refused(
            RefusalReason::OrganizationReadOnlyByVersion,
            "a newer version of rentable upgraded the organization, and this version may read it \
             but not write to it; nothing was changed",
        ));
    }

    let steps = store.format_steps();
    let before = store.floors().await?.ok_or_else(waits_for_its_owner)?;
    let (awaiting, after) = after_awaiting(&steps, before);

    if awaiting.is_empty() {
        return Ok(());
    }

    if steps.need_the_owner(&awaiting) && !owner {
        return Err(needs_the_owner());
    }

    let taken_at = now();
    let holder = &session.member_id;

    if let LeaseOutcome::HeldBy {
        holder_member_id,
        until,
    } = lease
        .take(
            ORGANIZATION_LEASE,
            holder,
            taken_at + MIGRATION_LEASE_LIFETIME_MS,
            taken_at,
        )
        .await?
    {
        return Err(under_way(&holder_member_id, until));
    }

    let ran = async {
        let database = format!("{ORGANIZATION_DATABASE_PREFIX}{}", session.organization_id);
        let label = format!("format-{}-to-{}", before.level, steps.known());

        backup::local_copy(store, store.directory(), &database, &label, taken_at).await?;

        if let Some(account) = account
            && !backup::remote_copy_made(store.directory(), &database, &label)
            && let Ok(name) = backup::remote_copy(account, &database, &label, taken_at).await
        {
            backup::remember_remote_copy(store.directory(), &database, &label, &name);
        }

        let format = floor::number(store.format().await?.unwrap_or(i64::from(steps.settled())))?;
        let legacy = steps.legacy_after(format, after);

        in_one_transaction(store, async {
            for number in &awaiting {
                work(*number).await?;
            }

            store.record_organization_floor(after, now()).await?;

            if legacy != format {
                store.write_format_version(i64::from(legacy)).await?;
            }

            checked(store).await
        })
        .await?;

        diagnostics::info("organization.upgrade.organization")
            .with("organization", session.organization_id.as_str())
            .with("member", session.member_id.as_str())
            .with(
                "steps",
                awaiting
                    .iter()
                    .map(u32::to_string)
                    .collect::<Vec<String>>()
                    .join(",")
                    .as_str(),
            )
            .write();

        if !store.push().await {
            diagnostics::warn("organization.upgrade.notYetSent")
                .with("organization", session.organization_id.as_str())
                .write();
        }

        Ok(())
    }
    .await;

    if let Err(error) = lease.release(ORGANIZATION_LEASE, holder).await {
        diagnostics::warn("organization.upgrade.releaseFailed")
            .with("organization", session.organization_id.as_str())
            .with("error", error.to_string().as_str())
            .write();
    }

    ran
}

/// Refuse with `ShapeNotAsBuilt` unless the organization, read inside the upgrade's transaction,
/// is what a fresh organization of this build is: SQLite's own checks pass, and every table this
/// build makes has the structure a fresh one has. A table this build does not make, which an
/// earlier change of format left alone, is left out on both sides, as the walk leaves them.
async fn checked(store: &OrganizationStore) -> Result<(), Error> {
    let fresh_database = turso::Builder::new_local(":memory:").build().await?;
    let fresh_connection = fresh_database.connect()?;

    crate::organization::store::install(&fresh_connection).await?;

    let others: Vec<String> = store
        .tables()
        .await?
        .into_iter()
        .filter(|table| !TABLES.contains(&table.as_str()))
        .collect();
    let others: Vec<&str> = others.iter().map(String::as_str).collect();
    let fresh = schema::read_engine(&fresh_connection)
        .await?
        .shape
        .without(&others);
    let found = store.found().await?;
    let found = schema::Found {
        shape: found.shape.without(&others),
        ..found
    };

    schema::as_built("the organization upgraded", &found, &fresh)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{
        Machine, ORGANIZATION_LEASE, Preview, Running, StepFacts, preview_organization,
        preview_workspace, run_organization, run_workspace,
    };
    use crate::{
        backup,
        credential::{CredentialStore, Memory},
        database::{
            floor::{Floors, Standing},
            step::{FORMAT_STEPS, Kind, Step, Steps, WORKSPACE_STEPS},
        },
        error::{Error, RefusalReason},
        machine::RemoteSyncStore,
        organization::{
            HeldOrganization,
            invitation::{
                AccountAndLink, Invitation, WorkspaceGrant, link::Locator, locator,
                make_account_and_link,
            },
            lease::{
                self, LeaseAuthority, MigrationPhase, Pending, StoreLease, apply, upgrade_over,
            },
            member::vault::{KdfParams, seal_content},
            role::{
                assign_role, create_role,
                permission::{self, Flag},
                set_override,
            },
            session::{CredentialSlot, MemberSession, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::{MachineVersionRecord, OrganizationStore},
            workspace::{create_workspace, openable, remote::Pipeline},
        },
        persisted::Persisted,
        sync::test::{
            pipeline::LocalPipeline,
            server::{ScriptedResponse, ScriptedServer},
        },
        test::scratch,
        turso::{
            discovery::McpEndpoint,
            platform::{AccessLevel, InMemoryPlatform},
        },
    };

    const PASSWORD: &str = "the owners password";
    const AT: i64 = 1_757_000_000_000;
    const DAY: i64 = 24 * 60 * 60 * 1000;

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// No Turso account in hand: every upgrade here copies to this machine alone.
    fn no_platform() -> Option<&'static InMemoryPlatform> {
        None
    }

    /// The password an invitation's vault was sealed under: the link's own secret and its code.
    fn secret_of(invited: &AccountAndLink) -> String {
        crate::organization::invitation::vault_password_of(
            &invited.join_link,
            &invited.code,
            test_cost(),
        )
    }

    /// The machine's record of a member who joined, on a machine of their own.
    fn joined_as(owner: &MemberSession, member_id: &str, role: &str) -> HeldOrganization {
        HeldOrganization {
            id: owner.organization_id.clone(),
            name: "Acme".to_string(),
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                owner.verifying_key,
            ),
            remote_url: String::new(),
            machine_id: format!("machine-of-{member_id}"),
            member_id: Some(member_id.to_string()),
            role: Some(role.to_string()),
            joined_at: 0,
            format: None,
            machine_signed_out: 0,
            turso_organization: None,
            workspace_id: None,
            name_signed: false,
            name_signed_at: 0,
            lock_marked: false,
            own_lock_latched: Vec::new(),
        }
    }

    /// The word a refusal carries, or a panic naming what came back instead.
    fn reason_of<T: std::fmt::Debug>(answer: Result<T, Error>) -> RefusalReason {
        match answer {
            Err(Error::Refused { reason, .. }) => reason,
            other => panic!("not a refusal: {other:?}"),
        }
    }

    /// An organization with its owner signed in and one workspace, judged by `format`, a ladder of
    /// the test's own.
    async fn organization(
        credentials: &dyn CredentialStore,
        directory: &std::path::Path,
        format: Steps,
    ) -> (OrganizationStore, MemberSession, Locator, String) {
        let mut machine = Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
            .expect("the store");
        let mcp = ScriptedServer::start(vec![
            ScriptedResponse::new(
                200,
                json!({ "jsonrpc": "2.0", "id": 1, "result": {} }).to_string(),
            ),
            ScriptedResponse::new(
                200,
                json!({
                    "jsonrpc": "2.0",
                    "id": 3,
                    "result": { "content": [{ "type": "text", "text": json!([{
                        "Name": "ledger",
                        "hostname": "ledger-an-org.aws-eu-west-1.turso.io",
                        "group": "rentable"
                    }]).to_string() }] }
                })
                .to_string(),
            ),
        ])
        .await;
        let platform = Arc::new(InMemoryPlatform::new("an-org"));
        let (_, store) = create_organization(
            credentials,
            &crate::clock::System::shared(),
            &mut machine,
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme",
                username: "olivia",
                password: PASSWORD,
                group: None,
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the first run failed");
        let store = store.declaring(format);
        let joined = machine.selected().cloned().expect("the record");
        let mut owner = sign_in(&store, &joined, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let pipeline = LocalPipeline::start().await;
        let workspace = create_workspace(
            &store,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "North",
            AT,
        )
        .await
        .expect("the workspace");
        let link = locator(&store, &owner).await.expect("the link");

        (store, owner, link, workspace.id)
    }

    /// A member invited by the owner into `workspaces` with full access, holding `role`, unlocked
    /// as whoever made them would unlock them, and signed in.
    async fn member(
        store: &OrganizationStore,
        owner: &MemberSession,
        link: &Locator,
        username: &str,
        role: &str,
        workspaces: &[&str],
    ) -> MemberSession {
        let grants: Vec<WorkspaceGrant> = workspaces
            .iter()
            .map(|id| WorkspaceGrant {
                id: id.to_string(),
                access: AccessLevel::FullAccess,
            })
            .collect();
        let invited = make_account_and_link(
            store,
            owner,
            no_platform(),
            link,
            Invitation {
                username,
                role,
                workspaces: &grants,
            },
            test_cost(),
            AT,
        )
        .await
        .expect("the invitation");

        crate::organization::member::lock::unlocked_for_a_test(store, owner, &invited.member_id)
            .await
            .expect("unlocked");

        let mut session = sign_in(
            store,
            &joined_as(owner, &invited.member_id, role),
            &secret_of(&invited),
            &slot(),
        )
        .await
        .expect("the member did not sign in");

        session.must_change_password = false;
        session
    }

    /// A step declared after effort 857.
    const fn after_857(kind: Kind, describes: &'static str) -> Step {
        Step {
            kind,
            describes,
            shipped_before_857: false,
        }
    }

    /// An upgrade declared after 857 raising the read floor to `read` and the write floor to
    /// `write`, where given.
    const fn later(read: Option<u32>, write: Option<u32>, describes: &'static str) -> Step {
        after_857(
            Kind::Upgrade {
                read_floor: read,
                write_floor: write,
                needs_owner: false,
            },
            describes,
        )
    }

    /// An upgrade declared after 857 that needs the owner's own key, raising both floors.
    const fn owners(number: u32) -> Step {
        after_857(
            Kind::Upgrade {
                read_floor: Some(number),
                write_floor: Some(number),
                needs_owner: true,
            },
            "anOwnersUpgrade",
        )
    }

    /// A fake upgrade's SQL: a renamed column, which an older build would write to in vain.
    const RENAME: &str = "ALTER TABLE `payment` RENAME COLUMN `note` TO `remark`;";

    /// A second fake upgrade's SQL: a table made and dropped again, in two statements.
    const REBUILD: &str = "CREATE TABLE `receipt` (`id` text PRIMARY KEY NOT NULL);\
                           --> statement-breakpoint\n\
                           DROP TABLE `receipt`;";

    /// A fake addition's SQL.
    const ADDITION_SQL: &str = "CREATE TABLE `receipt_note` (`id` text PRIMARY KEY NOT NULL, \
                                `note` text);";

    /// The shipped workspace ladder with `later` after it.
    fn workspace_ladder(later: &[(&'static str, &'static str, Step)]) -> apply::Migrations {
        let files: Vec<(&'static str, &'static str)> = apply::WORKSPACE_MIGRATIONS
            .iter()
            .copied()
            .chain(later.iter().map(|(name, sql, _)| (*name, *sql)))
            .collect();
        let declared: Vec<Step> = WORKSPACE_STEPS
            .iter()
            .copied()
            .chain(later.iter().map(|(_, _, step)| *step))
            .collect();

        apply::Migrations {
            files: Box::leak(files.into_boxed_slice()),
            steps: Steps {
                first: 1,
                declared: Box::leak(declared.into_boxed_slice()),
            },
        }
    }

    /// The shipped changes of format with `later` after them.
    fn format_ladder(later: &[Step]) -> Steps {
        let declared: Vec<Step> = FORMAT_STEPS
            .iter()
            .copied()
            .chain(later.iter().copied())
            .collect();

        Steps {
            first: 2,
            declared: Box::leak(declared.into_boxed_slice()),
        }
    }

    /// A workspace database at 7, as 0.20 leaves it.
    async fn at_seven() -> LocalPipeline {
        let pipeline = LocalPipeline::start().await;

        apply::apply(&Pipeline::at(&pipeline.url("")), "t", 7)
            .await
            .expect("the workspace at 7");

        pipeline
    }

    /// The integers `sql` reads off the workspace behind `pipeline`.
    async fn read_off(pipeline: &LocalPipeline, sql: &str) -> Vec<Vec<i64>> {
        use sqlx::Row;

        let mut connection = pipeline.connection().await;
        let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
            .fetch_all(&mut connection)
            .await
            .unwrap_or_else(|error| panic!("{sql}: {error}"));

        rows.iter()
            .map(|row| (0..row.len()).map(|at| row.get::<i64, _>(at)).collect())
            .collect()
    }

    /// The tables, and the columns of `payment`, of the workspace behind `pipeline`.
    async fn shape_of(pipeline: &LocalPipeline) -> (Vec<String>, Vec<String>) {
        use sqlx::Row;

        let mut connection = pipeline.connection().await;
        let mut tables: Vec<String> =
            sqlx::query("SELECT name FROM sqlite_master WHERE type = 'table'")
                .fetch_all(&mut connection)
                .await
                .expect("the tables")
                .iter()
                .map(|row| row.get::<String, _>(0))
                .collect();
        let columns = sqlx::query("SELECT name FROM pragma_table_info('payment')")
            .fetch_all(&mut connection)
            .await
            .expect("the columns")
            .iter()
            .map(|row| row.get::<String, _>(0))
            .collect();

        tables.sort();

        (tables, columns)
    }

    /// The copies of the database `database` this machine holds.
    fn copies(store: &OrganizationStore, database: &str) -> Vec<String> {
        std::fs::read_dir(backup::directory_of(store.directory(), database))
            .map(|entries| {
                entries
                    .flatten()
                    .map(|entry| entry.file_name().to_string_lossy().into_owned())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// The workspace `id`'s row, as the organization holds it.
    async fn row_of(
        store: &OrganizationStore,
        owner: &MemberSession,
        id: &str,
    ) -> crate::organization::store::WorkspaceRecord {
        store
            .workspaces(&owner.verifying_key)
            .await
            .expect("the workspaces")
            .into_iter()
            .find(|workspace| workspace.id == id)
            .expect("the workspace")
    }

    /// The upgrade of the workspace `id`, run by `session` against `pipeline`, on a build
    /// shipping `migrations`, the lease taken on the organization's own store.
    async fn run_on(
        store: &OrganizationStore,
        session: &MemberSession,
        id: &str,
        pipeline: &LocalPipeline,
        migrations: &apply::Migrations,
    ) -> Result<(), Error> {
        let url = pipeline.url("");

        run_workspace(
            Running {
                store,
                session,
                workspace_id: id,
                pipeline_of: &move |_| Pipeline::at(&url),
                account: no_platform(),
            },
            &StoreLease::new(store),
            migrations,
            || AT + 1,
        )
        .await
    }

    /// A change of format writing a row of `machine_version` named for its step, or failing where
    /// it is `failing`: the work a test's organization upgrade runs.
    async fn work_writing(
        store: &OrganizationStore,
        number: u32,
        failing: u32,
    ) -> Result<(), Error> {
        if number == failing {
            return Err(Error::Internal {
                message: format!("change {number} failed part way"),
            });
        }

        store
            .write_machine_version(&MachineVersionRecord {
                id: format!("written-by-change-{number}"),
                rentable: "0.0.0".to_string(),
                workspace_known: 0,
                format_known: number,
                written_at: AT,
            })
            .await
    }

    /// The upgrade of the organization run by `session`, each change through [`work_writing`].
    async fn run_organization_as(
        store: &OrganizationStore,
        session: &MemberSession,
        failing: u32,
    ) -> Result<(), Error> {
        run_organization(
            store,
            session,
            &StoreLease::new(store),
            no_platform(),
            |number| work_writing(store, number, failing),
            || AT,
        )
        .await
    }

    // -------------------------------------------------------------------------------------
    // Criterion 1: upgradeData, through GATES, and a step needing the owner.
    // -------------------------------------------------------------------------------------

    /// **Ticket 07's first criterion.** Both targets are offered to the owner, a manager, a custom
    /// role carrying `upgradeData` and a member an override grants it, and refused, with nothing
    /// written, to the member role and to a manager whose override removes it. A step needing the
    /// owner's own key is previewed for a manager, saying it needs the owner, run refused to them
    /// with `UpgradeNeedsOwner` before anything is copied, and run by the owner.
    #[tokio::test]
    async fn the_upgrade_is_upgrade_datas_and_a_step_needing_the_owner_is_the_owners() {
        let credentials = Memory::new();
        let directory = scratch("upgrade-gate");
        let (store, owner, link, workspace_id) = organization(
            &credentials,
            &directory,
            format_ladder(&[later(None, Some(4), "aLaterChange")]),
        )
        .await;
        let held = [workspace_id.as_str()];
        let upgrading = permission::mask_of(&[Flag::UpgradeData]);
        let manager = member(
            &store,
            &owner,
            &link,
            "ada.lead",
            permission::MANAGER,
            &held,
        )
        .await;
        let plain = member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &held,
        )
        .await;
        let granted = member(
            &store,
            &owner,
            &link,
            "omar.staff",
            permission::MEMBER,
            &held,
        )
        .await;
        let removed = member(
            &store,
            &owner,
            &link,
            "lena.lead",
            permission::MANAGER,
            &held,
        )
        .await;
        let custom = member(
            &store,
            &owner,
            &link,
            "nadia.custom",
            permission::MEMBER,
            &held,
        )
        .await;
        let upgrader = create_role(
            &store,
            &owner,
            "upgrader",
            permission::MEMBER_ROLE.mask | upgrading,
            permission::MANAGER,
            AT,
        )
        .await
        .expect("the custom role")
        .id;

        assign_role(&store, &owner, &custom.member_id, &upgrader, None, AT)
            .await
            .expect("the custom role given");
        set_override(&store, &owner, &granted.member_id, upgrading, AT)
            .await
            .expect("the override granting it");
        set_override(&store, &owner, &removed.member_id, upgrading, AT)
            .await
            .expect("the override removing it");

        let migrations = workspace_ladder(&[(
            "0007_fake_upgrade",
            RENAME,
            later(None, Some(8), "aLaterUpgrade"),
        )]);
        let pipeline = at_seven().await;
        let database = row_of(&store, &owner, &workspace_id).await.database_name;

        for (who, session) in [
            ("the owner", &owner),
            ("a manager", &manager),
            ("a custom role", &custom),
            ("an override granting it", &granted),
        ] {
            let workspace = preview_workspace(&store, session, &workspace_id, &migrations, AT)
                .await
                .unwrap_or_else(|error| panic!("{who} was refused the preview: {error:?}"));
            let organization = preview_organization(&store, session, AT)
                .await
                .unwrap_or_else(|error| panic!("{who} was refused the preview: {error:?}"));

            assert_eq!(
                workspace.steps,
                vec![StepFacts {
                    describes: "aLaterUpgrade".to_string()
                }],
                "{who}"
            );
            assert!(!workspace.needs_owner, "{who}");
            assert_eq!(
                organization.steps,
                vec![StepFacts {
                    describes: "aLaterChange".to_string()
                }],
                "{who}"
            );
        }

        for (who, session) in [
            ("the member role", &plain),
            ("an override removing it", &removed),
        ] {
            assert_eq!(
                reason_of(preview_workspace(&store, session, &workspace_id, &migrations, AT).await),
                RefusalReason::RoleLacksAct,
                "{who}"
            );
            assert_eq!(
                reason_of(preview_organization(&store, session, AT).await),
                RefusalReason::RoleLacksAct,
                "{who}"
            );
            assert_eq!(
                reason_of(run_on(&store, session, &workspace_id, &pipeline, &migrations).await),
                RefusalReason::RoleLacksAct,
                "{who}"
            );
            assert_eq!(
                reason_of(run_organization_as(&store, session, 0).await),
                RefusalReason::RoleLacksAct,
                "{who}"
            );
        }

        // nothing of either was run, or copied, for the refused.
        let (_, payment) = shape_of(&pipeline).await;

        assert!(payment.iter().any(|column| column == "note"), "{payment:?}");
        assert_eq!(
            row_of(&store, &owner, &workspace_id).await.schema_version,
            7
        );
        assert_eq!(store.format().await.expect("the format"), Some(3));
        assert_eq!(
            store.floors().await.expect("the floors"),
            Some(Floors::legacy(3))
        );
        assert!(copies(&store, &database).is_empty());

        // a step needing the owner: shown to a manager as the owner's, refused to them, the
        // owner's to run.
        let owners_ladder = workspace_ladder(&[("0007_fake_owners", RENAME, owners(8))]);
        let previewed = preview_workspace(&store, &manager, &workspace_id, &owners_ladder, AT)
            .await
            .expect("the manager's preview");

        assert!(previewed.needs_owner);
        assert_eq!(
            reason_of(run_on(&store, &manager, &workspace_id, &pipeline, &owners_ladder).await),
            RefusalReason::UpgradeNeedsOwner
        );
        assert_eq!(
            row_of(&store, &owner, &workspace_id).await.schema_version,
            7
        );
        assert!(copies(&store, &database).is_empty());

        run_on(&store, &owner, &workspace_id, &pipeline, &owners_ladder)
            .await
            .expect("the owner's upgrade");

        let (_, payment) = shape_of(&pipeline).await;

        assert!(
            payment.iter().any(|column| column == "remark"),
            "{payment:?}"
        );
    }

    /// The same on the organization: a change of format needing the owner's key is shown to a
    /// manager as the owner's and refused to them, and the owner runs it.
    #[tokio::test]
    async fn a_change_of_format_needing_the_owner_is_the_owners() {
        let credentials = Memory::new();
        let directory = scratch("upgrade-owners-change");
        let (store, owner, link, workspace_id) =
            organization(&credentials, &directory, format_ladder(&[owners(4)])).await;
        let manager = member(
            &store,
            &owner,
            &link,
            "ada.lead",
            permission::MANAGER,
            &[workspace_id.as_str()],
        )
        .await;

        assert!(
            preview_organization(&store, &manager, AT)
                .await
                .expect("the manager's preview")
                .needs_owner
        );
        assert_eq!(
            reason_of(run_organization_as(&store, &manager, 0).await),
            RefusalReason::UpgradeNeedsOwner
        );
        assert_eq!(
            store.floors().await.expect("the floors"),
            Some(Floors::legacy(3))
        );

        run_organization_as(&store, &owner, 0)
            .await
            .expect("the owner's upgrade");

        assert_eq!(
            store.floors().await.expect("the floors"),
            Some(Floors {
                level: 4,
                read: 4,
                write: 4
            })
        );
    }

    // -------------------------------------------------------------------------------------
    // Criterion 2: what the preview says, and of whom.
    // -------------------------------------------------------------------------------------

    /// **Ticket 07's second criterion.** A workspace whose upgrades raise its read floor to 8 and
    /// its write floor to 9: of the machines of members holding it, one seen this week on a build
    /// knowing 7 is stopped, by member, name and version; one knowing 8 is made read-only; one
    /// knowing 9 is left as it is; one that never recorded its version is stopped on an unknown
    /// version, since the number builds before 857 read moves; one knowing 7 last seen ten days ago
    /// is listed apart with that date; and the machine of a member without the workspace is not
    /// listed. The organization's preview reads `format_known` the same way, over every machine.
    #[tokio::test]
    async fn the_preview_lists_who_it_stops_who_it_makes_read_only_and_who_was_not_seen() {
        let credentials = Memory::new();
        let directory = scratch("upgrade-preview");
        let (store, owner, link, workspace_id) = organization(
            &credentials,
            &directory,
            format_ladder(&[later(Some(4), Some(4), "aLaterChange")]),
        )
        .await;
        let held = [workspace_id.as_str()];
        let ada = member(
            &store,
            &owner,
            &link,
            "ada.lead",
            permission::MANAGER,
            &held,
        )
        .await;
        let sami = member(
            &store,
            &owner,
            &link,
            "sami.staff",
            permission::MEMBER,
            &held,
        )
        .await;
        let omar = member(&store, &owner, &link, "omar.away", permission::MEMBER, &[]).await;

        for machine in store.machines().await.expect("the machines") {
            store
                .unregister_machine(&machine.id)
                .await
                .expect("a clean registry");
        }

        let now = AT + 30 * DAY;
        let machines: [(&str, &str, i64, Option<u32>); 6] = [
            ("knows-seven", &ada.member_id, now - DAY, Some(7)),
            ("knows-eight", &sami.member_id, now - 2 * DAY, Some(8)),
            ("knows-nine", &sami.member_id, now - DAY, Some(9)),
            ("never-recorded", &ada.member_id, now - 3 * DAY, None),
            ("away-ten-days", &sami.member_id, now - 10 * DAY, Some(7)),
            ("not-in-it", &omar.member_id, now - DAY, Some(7)),
        ];

        for (id, member_id, seen_at, known) in machines {
            store
                .register_machine(id, Some(member_id), seen_at)
                .await
                .expect("the machine");

            if let Some(known) = known {
                store
                    .write_machine_version(&MachineVersionRecord {
                        id: id.to_string(),
                        rentable: format!("0.{known}.0"),
                        workspace_known: known,
                        format_known: if known >= 8 { 4 } else { 3 },
                        written_at: seen_at,
                    })
                    .await
                    .expect("the version");
            }
        }

        store
            .write_machine_name(
                "knows-seven",
                Some(
                    &seal_content(&owner.content_key, "machine_name.name", b"Reception PC")
                        .expect("sealed"),
                ),
                now,
            )
            .await
            .expect("the name");

        let migrations = workspace_ladder(&[
            (
                "0007_fake_read",
                RENAME,
                later(Some(8), Some(8), "aReadFloorRaised"),
            ),
            (
                "0008_fake_write",
                REBUILD,
                later(None, Some(9), "aWriteFloorRaised"),
            ),
        ]);
        let preview = preview_workspace(&store, &owner, &workspace_id, &migrations, now)
            .await
            .expect("the preview");
        let machine = |member: &str, name: Option<&str>, rentable: Option<&str>, seen_at| Machine {
            member: Some(member.to_string()),
            name: name.map(str::to_string),
            rentable: rentable.map(str::to_string),
            seen_at,
        };

        assert_eq!(
            preview,
            Preview {
                steps: vec![
                    StepFacts {
                        describes: "aReadFloorRaised".to_string()
                    },
                    StepFacts {
                        describes: "aWriteFloorRaised".to_string()
                    },
                ],
                stopped: vec![
                    machine("ada.lead", Some("Reception PC"), Some("0.7.0"), now - DAY),
                    machine("ada.lead", None, None, now - 3 * DAY),
                ],
                read_only: vec![machine("sami.staff", None, Some("0.8.0"), now - 2 * DAY)],
                unseen: vec![machine("sami.staff", None, Some("0.7.0"), now - 10 * DAY)],
                needs_owner: false,
            }
        );

        // the organization's: a change raising both floors to 4 stops every machine knowing
        // format 3 and the one on an unknown version, whoever holds which workspace.
        let organization = preview_organization(&store, &owner, now)
            .await
            .expect("the organization's preview");

        assert_eq!(
            organization
                .stopped
                .iter()
                .map(|machine| (machine.member.as_deref(), machine.rentable.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                (Some("ada.lead"), Some("0.7.0")),
                (Some("omar.away"), Some("0.7.0")),
                (Some("ada.lead"), None),
            ]
        );
        assert!(organization.read_only.is_empty());
        assert_eq!(organization.unseen.len(), 1);

        // and with nothing waiting there is nothing to say.
        let nothing = preview_workspace(&store, &owner, &workspace_id, &apply::SHIPPED, now)
            .await
            .expect("the preview of nothing");

        assert_eq!(nothing, Preview::default());
    }

    // -------------------------------------------------------------------------------------
    // Criteria 3 and 5: the run, whole or nothing, and the legacy numbers.
    // -------------------------------------------------------------------------------------

    /// **Ticket 07's third and fifth criteria, on a workspace.** An upgrade running only an
    /// addition moves neither floor nor number. One raising the write floor to 9 is copied, run,
    /// checked, and recorded inside the workspace and in the organization; `schema_version` moves
    /// to 9, which every build before 857 refuses, while a build from 857 knowing 7 reads it
    /// read-only from the floors. A further upgrade leaves `schema_version` where it stopped them.
    #[tokio::test]
    async fn a_workspace_upgrade_records_its_floors_and_moves_the_legacy_number_past_857() {
        let credentials = Memory::new();
        let directory = scratch("upgrade-workspace");
        let (store, owner, _, workspace_id) =
            organization(&credentials, &directory, format_ladder(&[])).await;
        let database = row_of(&store, &owner, &workspace_id).await.database_name;
        let pipeline = at_seven().await;
        let addition = (
            "0007_fake_addition",
            ADDITION_SQL,
            after_857(Kind::Addition, "aLaterAddition"),
        );

        run_on(
            &store,
            &owner,
            &workspace_id,
            &pipeline,
            &workspace_ladder(&[addition]),
        )
        .await
        .expect("the addition");

        assert_eq!(
            row_of(&store, &owner, &workspace_id).await.schema_version,
            7
        );
        assert_eq!(
            store
                .workspace_floor(&workspace_id)
                .await
                .expect("the floor"),
            Some(Floors {
                level: 8,
                read: 7,
                write: 7
            })
        );

        let upgrade = (
            "0008_fake_upgrade",
            RENAME,
            later(None, Some(9), "aLaterUpgrade"),
        );

        run_on(
            &store,
            &owner,
            &workspace_id,
            &pipeline,
            &workspace_ladder(&[addition, upgrade]),
        )
        .await
        .expect("the upgrade");

        let (tables, payment) = shape_of(&pipeline).await;
        let floors = Floors {
            level: 9,
            read: 7,
            write: 9,
        };

        assert!(
            payment.iter().any(|column| column == "remark"),
            "{payment:?}"
        );
        assert!(tables.iter().any(|table| table == "receipt_note"));
        assert_eq!(
            read_off(&pipeline, "SELECT version FROM schema_version").await,
            vec![vec![9]]
        );
        assert_eq!(
            read_off(&pipeline, "SELECT level, read, write FROM data_floor").await,
            vec![vec![9, 7, 9]]
        );
        assert_eq!(
            store
                .workspace_floor(&workspace_id)
                .await
                .expect("the floor"),
            Some(floors)
        );
        assert_eq!(
            row_of(&store, &owner, &workspace_id).await.schema_version,
            9
        );
        assert_eq!(copies(&store, &database).len(), 2, "a copy before each run");
        assert!(
            store
                .migration_lease(&workspace_id)
                .await
                .expect("the lease")
                .is_none()
        );

        // every build before 857 refuses it, reading the number; a build from 857 knowing 7 reads
        // it, read-only, from the floors the organization records; and this one writes it.
        let workspaces = store.workspaces(&owner.verifying_key).await.expect("rows");
        let (facts, _) = openable(&owner, &workspaces, &[], &workspace_id)
            .expect("openable")
            .expect("a grant");
        let recorded = lease::recorded_floors(&store, &facts.id, facts.schema_version)
            .await
            .expect("the floors");

        assert_eq!(Floors::legacy(9).standing(7), Standing::Unreadable);
        assert_eq!(recorded, floors);
        assert_eq!(recorded.standing(7), Standing::ReadOnly);
        assert_eq!(recorded.standing(9), Standing::Writable);

        // a further upgrade raising the write floor to 10 leaves the number where it stopped them.
        run_on(
            &store,
            &owner,
            &workspace_id,
            &pipeline,
            &workspace_ladder(&[
                addition,
                upgrade,
                (
                    "0009_fake_upgrade",
                    REBUILD,
                    later(None, Some(10), "anotherLaterUpgrade"),
                ),
            ]),
        )
        .await
        .expect("the further upgrade");

        assert_eq!(
            row_of(&store, &owner, &workspace_id).await.schema_version,
            9
        );
        assert_eq!(
            store
                .workspace_floor(&workspace_id)
                .await
                .expect("the floor"),
            Some(Floors {
                level: 10,
                read: 7,
                write: 10
            })
        );
    }

    /// **Ticket 07's third criterion, a failure.** A workspace upgrade whose second step is refused
    /// part way leaves the workspace's version, its records, every table and the organization's
    /// floors and number as they were, with the copy written and the lease let go.
    #[tokio::test]
    async fn a_workspace_upgrade_failing_part_way_leaves_everything_but_the_copy() {
        let credentials = Memory::new();
        let directory = scratch("upgrade-workspace-fails");
        let (store, owner, _, workspace_id) =
            organization(&credentials, &directory, format_ladder(&[])).await;
        let database = row_of(&store, &owner, &workspace_id).await.database_name;
        let pipeline = at_seven().await;
        let migrations = workspace_ladder(&[
            (
                "0007_fake_upgrade",
                RENAME,
                later(None, Some(8), "aLaterUpgrade"),
            ),
            (
                "0008_fake_upgrade",
                REBUILD,
                later(Some(9), Some(9), "anotherLaterUpgrade"),
            ),
        ]);
        let before = shape_of(&pipeline).await;

        pipeline.refusing("DROP TABLE `receipt`;").await;

        let refused = run_on(&store, &owner, &workspace_id, &pipeline, &migrations).await;

        assert_eq!(reason_of(refused), RefusalReason::DatabaseRefused);
        assert_eq!(shape_of(&pipeline).await, before, "a table changed");
        assert_eq!(
            read_off(&pipeline, "SELECT version FROM schema_version").await,
            vec![vec![7]]
        );
        assert_eq!(
            row_of(&store, &owner, &workspace_id).await.schema_version,
            7
        );
        assert_eq!(
            store
                .workspace_floor(&workspace_id)
                .await
                .expect("the floor"),
            None
        );
        assert_eq!(copies(&store, &database).len(), 1, "no copy was written");
        assert!(
            store
                .migration_lease(&workspace_id)
                .await
                .expect("the lease")
                .is_none()
        );
    }

    /// **Ticket 07's third and fifth criteria, on the organization.** A change failing part way,
    /// and one leaving the organization other than a fresh one is, leave the format, the floors and
    /// every table as they were, with the copy written and the lease let go. Then the run copies
    /// the organization, runs both changes, checks it against a fresh organization, records
    /// `organization_floor`, and moves the `format` row to 5, which every build before 857 refuses.
    #[tokio::test]
    async fn an_organization_upgrade_is_whole_or_nothing_and_moves_the_format_past_857() {
        let credentials = Memory::new();
        let directory = scratch("upgrade-organization");
        let (store, owner, _, _) = organization(
            &credentials,
            &directory,
            format_ladder(&[
                later(None, Some(4), "aLaterChange"),
                later(Some(5), Some(5), "anotherLaterChange"),
            ]),
        )
        .await;
        let database = format!("org-{}", owner.organization_id);
        let tables = store.tables().await.expect("the tables");

        // the second change fails: nothing of the first is kept.
        let refused = run_organization_as(&store, &owner, 5).await;

        assert!(
            matches!(refused, Err(Error::Internal { .. })),
            "{refused:?}"
        );
        assert_eq!(store.format().await.expect("the format"), Some(3));
        assert_eq!(
            store.floors().await.expect("the floors"),
            Some(Floors::legacy(3))
        );
        assert_eq!(store.tables().await.expect("the tables"), tables);
        assert_eq!(
            store
                .machine_version("written-by-change-4")
                .await
                .expect("the row"),
            None,
            "the first change was kept"
        );
        assert_eq!(copies(&store, &database).len(), 1, "no copy was written");
        assert!(
            store
                .migration_lease(super::ORGANIZATION_LEASE)
                .await
                .expect("the lease")
                .is_none()
        );

        // a change leaving the organization other than a fresh one is refused by the check.
        let replica = &store;
        let reshaped = run_organization(
            &store,
            &owner,
            &StoreLease::new(&store),
            no_platform(),
            |number| async move {
                if number == 4 {
                    replica
                        .connection()
                        .execute("ALTER TABLE \"machine_name\" ADD COLUMN \"stray\" TEXT", ())
                        .await?;
                }

                Ok(())
            },
            || AT,
        )
        .await;

        assert_eq!(reason_of(reshaped), RefusalReason::ShapeNotAsBuilt);
        assert_eq!(store.format().await.expect("the format"), Some(3));
        assert_eq!(
            store.floors().await.expect("the floors"),
            Some(Floors::legacy(3))
        );
        assert!(
            !store
                .columns_of("machine_name")
                .await
                .expect("the columns")
                .iter()
                .any(|column| column == "stray"),
            "the stray column was kept"
        );

        // and run whole.
        run_organization_as(&store, &owner, 0)
            .await
            .expect("the upgrade");

        let floors = Floors {
            level: 5,
            read: 5,
            write: 5,
        };

        assert_eq!(store.floors().await.expect("the floors"), Some(floors));
        assert_eq!(store.format().await.expect("the format"), Some(5));

        for change in ["written-by-change-4", "written-by-change-5"] {
            assert!(
                store
                    .machine_version(change)
                    .await
                    .expect("the row")
                    .is_some(),
                "{change}"
            );
        }

        // one copy, taken at the same moment each time, so each run wrote it again.
        assert_eq!(copies(&store, &database).len(), 1);
        assert_eq!(
            store.refuse_another_format().await.expect("writable"),
            Standing::Writable
        );
    }

    /// **Ticket 07's fifth criterion, a write floor alone.** A change of format raising only the
    /// write floor past format 3 moves the `format` row to 4, which every build before 857 refuses
    /// as not its own, while a build from 857 knowing format 3 is judged by the floors and reads
    /// the organization read-only.
    #[tokio::test]
    async fn a_write_floor_alone_stops_builds_before_857_and_leaves_later_ones_reading() {
        let credentials = Memory::new();
        let directory = scratch("upgrade-organization-write");
        let (store, owner, _, _) = organization(
            &credentials,
            &directory,
            format_ladder(&[later(None, Some(4), "aLaterChange")]),
        )
        .await;

        run_organization_as(&store, &owner, 0)
            .await
            .expect("the upgrade");

        assert_eq!(store.format().await.expect("the format"), Some(4));
        assert_eq!(
            store.floors().await.expect("the floors"),
            Some(Floors {
                level: 4,
                read: 3,
                write: 4
            })
        );

        // a build from 857 knowing format 3 is judged by the floors, and reads it read-only.
        let earlier = store.declaring(format_ladder(&[]));

        assert_eq!(
            earlier.refuse_another_format().await.expect("readable"),
            Standing::ReadOnly
        );
    }

    // -------------------------------------------------------------------------------------
    // Criterion 4: the lease.
    // -------------------------------------------------------------------------------------

    /// **Ticket 07's fourth criterion.** While another member holds the lease, the upgrade of the
    /// workspace and of the organization is refused with `UpgradeUnderWay`, with nothing written
    /// and no copy taken. And while the upgrade holds it, a second member opening the workspace on
    /// a build with an addition to run waits on the lease rather than writing, and finds the
    /// workspace brought up once it is let go: nothing of theirs lands between the steps.
    #[tokio::test]
    async fn a_second_session_waits_on_the_upgrades_lease_or_is_refused() {
        let credentials = Memory::new();
        let directory = scratch("upgrade-lease");
        let (store, owner, link, workspace_id) = organization(
            &credentials,
            &directory,
            format_ladder(&[later(None, Some(4), "aLaterChange")]),
        )
        .await;
        let manager = member(
            &store,
            &owner,
            &link,
            "ada.lead",
            permission::MANAGER,
            &[workspace_id.as_str()],
        )
        .await;
        let database = row_of(&store, &owner, &workspace_id).await.database_name;
        let pipeline = at_seven().await;
        let migrations = workspace_ladder(&[
            (
                "0007_fake_upgrade",
                RENAME,
                later(None, Some(8), "aLaterUpgrade"),
            ),
            (
                "0008_fake_addition",
                ADDITION_SQL,
                after_857(Kind::Addition, "aLaterAddition"),
            ),
        ]);
        let lease = StoreLease::new(&store);

        // the manager holds both leases, as an upgrade of theirs under way would.
        lease
            .take(&workspace_id, &manager.member_id, AT + 60_000, AT)
            .await
            .expect("the workspace's lease");
        lease
            .take(ORGANIZATION_LEASE, &manager.member_id, AT + 60_000, AT)
            .await
            .expect("the organization's lease");

        assert_eq!(
            reason_of(run_on(&store, &owner, &workspace_id, &pipeline, &migrations).await),
            RefusalReason::UpgradeUnderWay
        );
        assert_eq!(
            reason_of(run_organization_as(&store, &owner, 0).await),
            RefusalReason::UpgradeUnderWay
        );
        assert_eq!(
            row_of(&store, &owner, &workspace_id).await.schema_version,
            7
        );
        assert_eq!(store.format().await.expect("the format"), Some(3));
        assert!(copies(&store, &database).is_empty());
        assert!(copies(&store, &format!("org-{}", owner.organization_id)).is_empty());

        lease
            .release(&workspace_id, &manager.member_id)
            .await
            .expect("let go");
        lease
            .release(ORGANIZATION_LEASE, &manager.member_id)
            .await
            .expect("let go");

        // the owner's upgrade under way: the lease taken as the run takes it, and the manager
        // opening the workspace meanwhile. The opening finds the lease held and waits; while it
        // waits, the owner's run goes on under the same lease, runs every step and lets it go.
        // One connection serves both, so they take turns where the opening waits, which is the
        // only moment it could.
        lease
            .take(&workspace_id, &owner.member_id, AT + 60_000, AT)
            .await
            .expect("the owner's lease");

        let phases = Mutex::new(Vec::new());
        let first = std::cell::Cell::new(true);
        let workspaces = store
            .workspaces(&manager.verifying_key)
            .await
            .expect("rows");
        let (facts, held) = openable(&manager, &workspaces, &[], &workspace_id)
            .expect("openable")
            .expect("a grant");
        let waiting = {
            let (store, owner, workspace_id, pipeline, migrations, first, phases) = (
                &store,
                &owner,
                workspace_id.as_str(),
                &pipeline,
                &migrations,
                &first,
                &phases,
            );

            move || {
                let upgrading = first.replace(false);

                async move {
                    if upgrading {
                        assert!(
                            !phases
                                .lock()
                                .expect("the phases")
                                .iter()
                                .any(|phase| matches!(phase, MigrationPhase::Applying { .. })),
                            "the second session wrote while the lease was held"
                        );

                        run_on(store, owner, workspace_id, pipeline, migrations)
                            .await
                            .expect("the upgrade");
                    }
                }
            }
        };

        upgrade_over(
            &migrations,
            Pending {
                store: &store,
                session: &manager,
                facts: &facts,
                held: &held,
                pipeline: &Pipeline::at(&pipeline.url("")),
                account: no_platform(),
            },
            &StoreLease::new(&store),
            waiting,
            |phase| phases.lock().expect("the phases").push(phase),
            || AT + 2,
        )
        .await
        .expect("the opening");

        assert!(!first.get(), "the opening never waited");

        let phases = phases.into_inner().expect("the phases");

        assert!(
            phases.iter().any(|phase| matches!(
                phase,
                MigrationPhase::Waiting { holder_member_id, .. }
                    if *holder_member_id == owner.member_id
            )),
            "{phases:?}"
        );
        assert!(
            !phases
                .iter()
                .any(|phase| matches!(phase, MigrationPhase::Applying { .. })),
            "the second session wrote while the lease was held: {phases:?}"
        );
        assert_eq!(
            read_off(&pipeline, "SELECT version FROM schema_version").await,
            vec![vec![9]]
        );
        assert_eq!(
            store
                .workspace_floor(&workspace_id)
                .await
                .expect("the floor"),
            Some(Floors {
                level: 9,
                read: 7,
                write: 8
            })
        );
        assert_eq!(copies(&store, &database).len(), 1, "one upgrade, one copy");
    }
}
