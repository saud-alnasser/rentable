//! the acts on a member's own row: the role they hold, their override, and their override in one
//! workspace (effort 838, requirements 5, 6 and 12).

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
};

use super::permission::{self, Flag};
use super::{
    apply::{Change, apply, refuse_unheld},
    member_facts, sent,
};
use crate::organization::{
    invitation::MemberFacts,
    session::{MemberSession, actor, rank_of},
    store::{
        MemberLockRecord, MemberRecord, OrganizationStore, Signer, WorkspaceOverrideRecord,
        locked_in, member_lock_authority, pins_of,
    },
    workspace::signer_of,
};

/// The member an act on somebody's role or override is about: in this organization, still in, not
/// the owner, and not the actor (requirements 5, 6 and 7).
///
/// **The owner's row is refused before the actor's own**, so the owner asking to change their own
/// role or override is told what is true of that row rather than that it is theirs.
fn acted_on<'a>(
    rows: &'a [MemberRecord],
    session: &MemberSession,
    member_id: &str,
    owner_refusal: &str,
) -> Result<&'a MemberRecord, Error> {
    let member = rows
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| {
            Error::refused(
                RefusalReason::MemberMissing,
                "that member is not in this organization",
            )
        })?;

    // an uncovered row is never saved, an assignment's included (the re-check of ticket 20).
    crate::organization::session::refuse_unsettled(member)?;

    if member.removed_at.is_some() {
        return Err(Error::refused(
            RefusalReason::MemberRemoved,
            "that member was removed. make them an account again if they are to come back",
        ));
    }

    if member.role_id == permission::OWNER {
        return Err(Error::refused(RefusalReason::OwnerProtected, owner_refusal));
    }

    if member.id == session.member_id {
        return Err(Error::refused(
            RefusalReason::NotYourself,
            "you cannot change your own role or override. somebody who ranks above you can",
        ));
    }

    Ok(member)
}

/// Give a member a role (requirement 5), and with it, where `override_mask` is given, their
/// override (requirement 6). **With none, the override they carried is cleared in the same signed
/// write**, so they hold the role exactly (requirement 6, as amended 2026-09-27). *It stayed, read
/// against the new role's mask, until that amendment: an override switching one role's flags
/// switched different ones on the next.*
///
/// **`assignRole`, the rank of the member and of the role, never yourself, and only flags you
/// hold** (requirement 7); and **`overrideMember` too, where the act leaves them an override**.
/// Clearing one is part of assigning, so it asks nothing more. The role and the override are one
/// act, so "flags held" is asked of the member's
/// effective permissions before and after both together: a role whose mask carries a flag the actor
/// lacks, given with an override switching it back, moves nothing the actor does not hold, where
/// the two asked one after the other would each be refused on the state between them (converge,
/// round 1, ticket 14). The owner's role is not assigned: it moves by the handover, which is the
/// owner's. Their certificate is issued again from the actor's in the same act, with the role's
/// rank and their new effective permissions, so a flag that signs rows is in force on the next sync
/// without the owner (requirement 9).
pub async fn assign_role(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
    role_id: &str,
    override_mask: Option<i64>,
    now: i64,
) -> Result<MemberFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::AssignRole)?;

    let rows = store.members(&session.verifying_key).await?;
    let member = acted_on(
        &rows,
        session,
        member_id,
        "the owner's role is not changed. the organization is theirs",
    )?;

    // a member given a role holds it exactly: the override they carried is cleared in the same
    // signed write, unless the act gives one with the role (requirement 6, as amended 2026-09-27).
    let override_mask = override_mask.unwrap_or(0);

    if override_mask != 0 {
        permission::require(actor.row.effective, Flag::OverrideMember)?;
    }

    actor.outranks(
        rank_of(store, session, member).await?,
        "that member's role is not below yours, so their role is changed by somebody who ranks \
         above them",
    )?;

    if role_id == permission::OWNER {
        return Err(Error::refused(
            RefusalReason::OwnerRoleNotAssigned,
            "the owner's role is not assigned. the owner hands the organization over",
        ));
    }

    let (_, rank) = store.role_standing(&session.verifying_key, role_id).await?;

    actor.outranks(
        rank,
        "that role is not below yours, so it is given by somebody who ranks above it",
    )?;

    // the member's lock as it reads before the role moves (effort 851): a lock signed by somebody
    // the new role reaches to or above would stop verifying and read locked, so it is signed again
    // below, as it stood, by the assigner, who ranks above the role it gives.
    let locks = store.member_locks(&session.verifying_key).await?;
    let latched = locks.latch(&session.lock_marked);
    let lock_held = locks.rows.contains_key(&member.id) || latched;
    let was_locked = locked_in(&locks, member, latched);

    apply(
        store,
        session,
        &actor,
        Change {
            members: vec![(member.id.clone(), role_id.to_string(), override_mask)],
            // and their overrides in every workspace go with it: they hold the role exactly
            // (requirement 12, as amended a third time).
            cleared: vec![member.id.clone()],
            ..Change::default()
        },
        now,
    )
    .await?;

    if lock_held {
        let lock = MemberLockRecord {
            member_id: member.id.clone(),
            locked: was_locked,
            updated_at: now,
        };
        let (key, certificate) = signer_of(store, session).await?;
        let signer = Signer {
            key: &key,
            certificate: &certificate,
        };

        if store.covered(&signer, member_lock_authority(&lock)).await? {
            store.write_member_lock(&signer, &lock).await?;
        } else {
            diagnostics::warn("organization.member.lockNotCarried")
                .with("member", member_id)
                .write();
        }
    }

    sent(
        store,
        "organization.member.roleNotYetSent",
        "member",
        member_id,
    )
    .await;
    diagnostics::info("organization.member.roleAssigned")
        .with("member", member_id)
        .with("role", role_id)
        .write();

    member_facts(store, session, member_id).await
}

/// Set a member's override: the flags switched for them alone (requirement 6). Zero clears it,
/// which is resetting them to their role, and their overrides in every workspace go with it
/// (requirement 12, as amended a third time).
///
/// **`overrideMember`, the rank of the member, never yourself, and only flags you hold**
/// (requirement 7): every flag whose value the member ends up with differently is one the actor
/// holds, and none of the owner's is set. The owner's row carries no override. Their certificate
/// is issued again from the actor's in the same act.
pub async fn set_override(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
    override_mask: i64,
    now: i64,
) -> Result<MemberFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::OverrideMember)?;

    let rows = store.members(&session.verifying_key).await?;
    let member = acted_on(
        &rows,
        session,
        member_id,
        "the owner carries every flag, and their row carries no override",
    )?;

    actor.outranks(
        rank_of(store, session, member).await?,
        "that member's role is not below yours, so their override is set by somebody who ranks \
         above them",
    )?;

    apply(
        store,
        session,
        &actor,
        Change {
            members: vec![(member.id.clone(), member.role_id.clone(), override_mask)],
            // clearing it is resetting them to their role, and their overrides in every workspace
            // go with it (requirement 12, as amended a third time).
            cleared: if override_mask == 0 {
                vec![member.id.clone()]
            } else {
                Vec::new()
            },
            ..Change::default()
        },
        now,
    )
    .await?;

    sent(
        store,
        "organization.member.overrideNotYetSent",
        "member",
        member_id,
    )
    .await;
    diagnostics::info("organization.member.overrideSet")
        .with("member", member_id)
        .write();

    member_facts(store, session, member_id).await
}

/// Set a member's override for one workspace: the record flags `pinned` for them there, whatever
/// they hold across the organization, and which of those are on, `granted` (effort 838,
/// requirement 12 as amended a third time, and at review round one). Nothing pinned deletes it,
/// and they hold there what they hold across the organization.
///
/// **Under the organization override's rules** (requirements 6 and 7): `overrideMember`, the
/// member ranked below the actor, never the actor's own row nor the owner's, and only flags the
/// actor holds, which here are the flags pinned or unpinned and the flags whose pinned value
/// moves. **And four of its own**: record flags alone, granted within pinned, a workspace the
/// member is in (their grant on it verifies), and nothing added, edited or deleted there that
/// they cannot view as they stand now. The row is signed under the actor's certificate, which
/// carries every flag it pins, the ones it only keeps included, as a member row's override is.
pub async fn set_workspace_override(
    store: &OrganizationStore,
    session: &MemberSession,
    member_id: &str,
    workspace_id: &str,
    pinned: i64,
    granted: i64,
) -> Result<MemberFacts, Error> {
    session.settled()?;

    let actor = actor(store, session).await?;

    permission::require(actor.row.effective, Flag::OverrideMember)?;

    let rows = store.members(&session.verifying_key).await?;
    let member = acted_on(
        &rows,
        session,
        member_id,
        "the owner carries every flag in every workspace, and nothing is overridden for them",
    )?;

    actor.outranks(
        rank_of(store, session, member).await?,
        "that member's role is not below yours, so what they may do in a workspace is set by \
         somebody who ranks above them",
    )?;

    if let Some(flag) = permission::first_beyond_records(pinned) {
        return Err(Error::refused(
            RefusalReason::RecordFlagsOnly,
            format!(
                "{flag} is not a record flag, and a workspace changes only what may be done to its \
                 records. nothing was changed"
            ),
        ));
    }

    if let Some(flag) = permission::first_not_held(pinned, granted) {
        return Err(Error::refused(
            RefusalReason::RecordFlagsOnly,
            format!(
                "{flag} is granted in that workspace without being set there, and only what is \
                 set there is granted. nothing was changed"
            ),
        ));
    }

    // the directory grant is how a member reads the organization at all, and it is not a
    // workspace.
    if workspace_id == session.organization_id {
        return Err(Error::refused(
            RefusalReason::WorkspaceMissing,
            "that is the organization itself, not a workspace",
        ));
    }

    if !store
        .grants(&session.verifying_key)
        .await?
        .iter()
        .any(|grant| grant.member_id == member.id && grant.workspace_id == workspace_id)
    {
        return Err(Error::refused(
            RefusalReason::GrantMissing,
            "that member holds no grant on that workspace, so nothing is set for them there",
        ));
    }

    let (pinned_before, granted_before) = pins_of(
        &store.workspace_overrides(&session.verifying_key).await?,
        &member.id,
        workspace_id,
    );

    // a flag pinned or unpinned is as changed as one whose pinned value moves (requirement 7).
    refuse_unheld(
        &actor,
        (pinned_before ^ pinned) | (granted_before ^ granted),
    )?;

    // no add, edit or delete is turned on there for a kind of record they cannot view as they
    // stand now (requirement 6, as amended 2026-09-27). A write the layers beneath carry without
    // its view is dropped where it is read, so it is not refused here: a card that turns a kind's
    // view off beside it has left it nothing to pin.
    if (pinned_before, granted_before) != (pinned, granted) {
        let unturned = permission::mask_of(&permission::WRITE_FLAGS) & !granted;

        permission::refuse_write_without_view(
            permission::pinned_in(member.effective, pinned, granted) & !unturned,
            "this member's permissions in that workspace",
        )?;
    }

    if pinned == 0 {
        store
            .delete_workspace_override(&member.id, workspace_id)
            .await?;
    } else {
        let (key, certificate) = signer_of(store, session).await?;

        // the row is signed under the actor's certificate, which carries every flag it pins, the
        // ones this act leaves where they were included (the row-kind table).
        if let Some(flag) = permission::first_not_held(certificate.ceiling, pinned) {
            return Err(Error::refused(
                RefusalReason::RoleLacksAct,
                format!(
                    "this member has {flag} set for them in that workspace, and you do not hold \
                     it, so the row cannot be signed by you. nothing was changed"
                ),
            ));
        }

        store
            .write_workspace_override(
                &Signer {
                    key: &key,
                    certificate: &certificate,
                },
                &WorkspaceOverrideRecord {
                    member_id: member.id.clone(),
                    workspace_id: workspace_id.to_string(),
                    pinned,
                    granted,
                },
            )
            .await?;
    }

    sent(
        store,
        "organization.member.workspaceOverrideNotYetSent",
        "member",
        member_id,
    )
    .await;
    diagnostics::info("organization.member.workspaceOverrideSet")
        .with("member", member_id)
        .with("workspace", workspace_id)
        .write();

    member_facts(store, session, member_id).await
}
