//! the one path a change to roles and members takes: the gates every act shares, and the change
//! applied with its certificates following in the same transaction (effort 838, requirement 7).

use crate::error::{Error, RefusalReason};

use super::permission::{self, CUSTOM};
use super::{Standing, facts_of, in_one_transaction, reissue_within};
use crate::organization::{
    session::{Actor, MemberSession},
    store::{MemberRecord, OrganizationStore, RoleRecord, Signer},
    workspace::signer_of,
};

/// A role's verified row, refused by name where this organization holds none under that id. The
/// owner's role is a constant and is not a row, so it is refused here too; a caller that means the
/// owner's role says so first.
pub(super) fn role_row<'a>(rows: &'a [RoleRecord], role_id: &str) -> Result<&'a RoleRecord, Error> {
    rows.iter().find(|role| role.id == role_id).ok_or_else(|| {
        Error::refused(
            RefusalReason::RoleUnknown,
            "that role is not in this organization",
        )
    })
}

/// Refuse an act that only a custom role takes: renaming, moving and deleting one (requirement 3).
pub(super) fn refuse_built_in(role_id: &str, act: &str) -> Result<(), Error> {
    if permission::BUILT_IN.iter().any(|role| role.id == role_id) {
        return Err(Error::refused(
            RefusalReason::RoleBuiltIn,
            format!(
                "{role_id} is one of the three roles every organization has, and it is not {act}"
            ),
        ));
    }

    Ok(())
}

/// Requirement 7's "only flags you hold", over what an act changes: every bit of `changed` is one
/// the actor holds. A flag switched off is as changed as one switched on.
pub(super) fn refuse_unheld(actor: &Actor, changed: i64) -> Result<(), Error> {
    match permission::first_not_held(actor.row.effective, changed) {
        Some(flag) => Err(Error::refused(
            RefusalReason::RoleLacksAct,
            format!("you do not hold {flag}, so you cannot give it or take it away"),
        )),
        None => Ok(()),
    }
}

/// Requirement 2: none of the owner's flags is set anywhere but on the owner.
pub(super) fn refuse_owner_only(mask: i64) -> Result<(), Error> {
    match permission::first_owner_only(mask) {
        Some(flag) => Err(Error::refused(
            RefusalReason::OwnerOnly,
            format!("{flag} is the owner's alone, and no role or override carries it"),
        )),
        None => Ok(()),
    }
}

/// A custom role's name as the act gives it: trimmed, present, and nobody else's. Compared without
/// case against every custom role but `except` and against the three built-in ids, so no role reads
/// as another.
pub(super) fn validated_name(
    session: &MemberSession,
    rows: &[RoleRecord],
    name: &str,
    except: Option<&str>,
) -> Result<String, Error> {
    let name = name.trim();

    if name.is_empty() {
        return Err(Error::refused(
            RefusalReason::RoleNameMissing,
            "a role is given a name",
        ));
    }

    let wanted = name.to_lowercase();
    let taken = |held: &str| held.to_lowercase() == wanted;

    if permission::BUILT_IN.iter().any(|role| taken(role.id)) {
        return Err(Error::refused(
            RefusalReason::RoleNameTaken,
            "that name is taken by a role every organization has",
        ));
    }

    for role in rows
        .iter()
        .filter(|role| role.kind == CUSTOM && except != Some(role.id.as_str()))
    {
        if taken(&facts_of(session, role, 0)?.name) {
            return Err(Error::refused(
                RefusalReason::RoleNameTaken,
                "another role is called that",
            ));
        }
    }

    Ok(name.to_string())
}

/// Where a role placed directly below `after_role_id` stands, and the custom roles renumbered to
/// make room for it (effort 838, the plan's *Data Model*).
///
/// `rows` are the role rows the placement is among, without the role being moved. **A custom role
/// ranks strictly between the member and the manager**, so `after_role_id` names the manager or a
/// custom role; the rank taken is the midpoint of it and the role below it, and it has to rank
/// below `top`, which is the actor's rank or the manager's, whichever is lower. Where no integer
/// is left between the two, the custom roles below `top` are renumbered evenly across it with the
/// new one in its place, so the order is kept and every rank moves only below the actor.
pub(super) fn placed(
    rows: &[RoleRecord],
    after_role_id: &str,
    top: i64,
) -> Result<(i64, Vec<RoleRecord>), Error> {
    let above = if after_role_id == permission::MANAGER {
        permission::MANAGER_ROLE.rank
    } else if after_role_id == permission::OWNER || after_role_id == permission::MEMBER {
        return Err(Error::refused(
            RefusalReason::RoleOutOfPlace,
            "a custom role goes below the manager and above the member",
        ));
    } else {
        role_row(rows, after_role_id)?.rank
    };
    let below = rows
        .iter()
        .map(|role| role.rank)
        .filter(|rank| *rank < above)
        .max()
        .unwrap_or(permission::MEMBER_ROLE.rank);
    let not_below = || {
        Error::refused(
            RefusalReason::RankNotAbove,
            "that place is not below your role, so a role is put there by somebody who ranks \
             above it",
        )
    };

    if above - below >= 2 {
        let rank = below + (above - below) / 2;

        return if rank < top {
            Ok((rank, Vec::new()))
        } else {
            Err(not_below())
        };
    }

    if above > top {
        return Err(not_below());
    }

    // the gap has closed: the custom roles below the actor, highest first, with the new one's
    // place marked, spread evenly between the member and the actor.
    let mut order: Vec<Option<&RoleRecord>> = rows
        .iter()
        .filter(|role| role.kind == CUSTOM && role.rank < top)
        .map(Some)
        .collect();

    order.sort_by_key(|role| role.map(|role| -role.rank));

    let at = order
        .iter()
        .position(|role| role.is_some_and(|role| role.id == after_role_id))
        .map_or(0, |index| index + 1);

    order.insert(at, None);

    let spacing = top / (order.len() as i64 + 1);

    if spacing < 1 {
        return Err(Error::refused(
            RefusalReason::NoRankBelow,
            "there is no room left below your role for another. somebody who ranks above you \
             can make some",
        ));
    }

    let mut rank = 0;
    let mut renumbered = Vec::new();

    for (index, role) in order.into_iter().enumerate() {
        let slot = top - spacing * (index as i64 + 1);

        match role {
            None => rank = slot,
            Some(role) if role.rank != slot => renumbered.push(RoleRecord {
                rank: slot,
                ..role.clone()
            }),
            Some(_) => {}
        }
    }

    Ok((rank, renumbered))
}

/// The highest a role an actor places may stand: below their own rank, and below the manager's,
/// since a custom role ranks under the manager whoever makes it.
pub(super) fn top_for(actor: &Actor) -> i64 {
    actor.rank.min(permission::MANAGER_ROLE.rank)
}

/// What an act asks of the directory: the role rows it writes as they are to stand, the roles it
/// deletes, and the members it moves to a role or an override, each as `(member, role, override)`.
#[derive(Default)]
pub(super) struct Change {
    pub(super) roles: Vec<RoleRecord>,
    pub(super) deleted: Vec<String>,
    pub(super) members: Vec<(String, String, i64)>,
    /// the members whose overrides in every workspace go with the act: one given another role or
    /// reset to their role (effort 838, requirement 12 as amended a third time). A holder of a
    /// deleted role is among them without being named here.
    pub(super) cleared: Vec<String>,
}

/// One member row an act rewrites, and where its holder stands before and after.
struct Moved {
    row: MemberRecord,
    role_id: String,
    override_mask: i64,
    effective: i64,
    rank: i64,
}

/// Apply a change to roles and members, with the certificates following in the same act (effort
/// 838, the plan's *Architecture*, "What a change does to certificates").
///
/// **What it checks, before a row is written.** Requirement 7's "only flags you hold" over the
/// change as a whole: every bit that differs, in a role's mask or in the effective permissions of
/// anybody the change moves, is one the actor holds, and none of the owner's flags is set on a role
/// or on anybody's permissions. Then the row-kind table over what it signs: every role row's mask
/// it writes, and the override of every member row it rewrites, within the actor's certificate,
/// since the chain refuses a row that switches more than its signer holds; the certificate each
/// holder is issued holds their whole effective permissions to the actor's. The gates in front of
/// it (the flag, the rank, never yourself) are each command's own.
///
/// **What it writes, in one transaction.** The rows of every member it moves, re-signed under the
/// actor with the role and the override they now name: first, so that a row whose role is
/// re-ranked stays signed by a certificate that outranks it. Then the role rows, and the deletions.
/// Then each member still in is issued a fresh certificate from the actor's, with their new
/// effective permissions and rank, and every older one retired ([`reissue_within`]). A member whose
/// certificate the actor could not issue, or whose old one signed or issued something the actor
/// could not, refuses the whole act by name and nothing moves.
///
/// A member row the change names, or whose role it writes or deletes, is rewritten wherever its
/// role, its override, what it grants or its rank moves. A removed member's row grants nothing
/// before and after, is re-signed where its role or its rank moves, and holds no certificate to
/// follow.
///
/// **Their workspace overrides go with the organization layer** (effort 838, requirement 12 as
/// amended a third time): every one a member the change clears carries, and every one a holder of
/// a deleted role carries, deleted in the same transaction. Each flag pinned for them in a
/// workspace is one the actor holds, as every flag the act moves is.
///
/// **A row its certificate no longer covers is never saved** (effort 838, the re-check of ticket
/// 20): nothing the directory holds says which of its fields are genuine, so its content is never
/// carried forward as authority. The commands refuse an act naming it, and an edit of the role it
/// names, or a deletion, leaves it as it stands. *An assignment saved one until the re-check found
/// it lifting a covered removal a forger had re-signed and certifying a signing key the forger had
/// put on the row.*
pub(super) async fn apply(
    store: &OrganizationStore,
    session: &MemberSession,
    actor: &Actor,
    change: Change,
    now: i64,
) -> Result<(), Error> {
    let before = store.roles(&session.verifying_key).await?;
    let after: Vec<RoleRecord> = before
        .iter()
        .filter(|role| {
            !change.deleted.contains(&role.id)
                && !change.roles.iter().any(|changed| changed.id == role.id)
        })
        .cloned()
        .chain(change.roles.iter().cloned())
        .collect();
    let standing_in = |rows: &[RoleRecord], role_id: &str| -> Option<(i64, i64)> {
        if role_id == permission::OWNER {
            Some((permission::OWNER_ROLE.mask, permission::OWNER_ROLE.rank))
        } else {
            rows.iter()
                .find(|role| role.id == role_id)
                .map(|role| (role.mask, role.rank))
        }
    };

    for role in &change.roles {
        let was = standing_in(&before, &role.id).map(|(mask, _)| mask);

        refuse_owner_only(role.mask)?;
        refuse_unheld(actor, was.unwrap_or(0) ^ role.mask)?;

        // a role made or given another mask adds, edits or deletes no kind of record it does not
        // view (requirement 6, as amended 2026-09-27); one only renamed or renumbered is signed
        // again as it stands.
        if was != Some(role.mask) {
            permission::refuse_write_without_view(role.mask, "this role")?;
        }
    }

    let mut moved = Vec::new();

    for row in store.members(&session.verifying_key).await? {
        // a row the change does not name, whose role it neither writes nor deletes, stands as it
        // was.
        if !change
            .members
            .iter()
            .any(|(member_id, _, _)| *member_id == row.id)
            && !change.roles.iter().any(|role| role.id == row.role_id)
            && !change.deleted.contains(&row.role_id)
        {
            continue;
        }

        let unknown = || Error::Integrity {
            message: "a member's role is not among the organization's roles".to_string(),
        };

        // a row its certificate no longer covers is never saved (the re-check of ticket 20): the
        // commands refuse an act naming it, and an edit of the role it names leaves it as it
        // stands.
        if !row.covered {
            continue;
        }

        let (role_id, override_mask) = change
            .members
            .iter()
            .find(|(member_id, _, _)| *member_id == row.id)
            .map(|(_, role_id, override_mask)| (role_id.clone(), *override_mask))
            .unwrap_or_else(|| {
                // a holder of a deleted role is given the member role, and holds it exactly: the
                // override they carried is cleared with it (requirement 6, as amended 2026-09-27).
                if change.deleted.contains(&row.role_id) {
                    (permission::MEMBER.to_string(), 0)
                } else {
                    (row.role_id.clone(), row.override_mask)
                }
            });
        let (_, rank_before) = standing_in(&before, &row.role_id).ok_or_else(unknown)?;
        let (mask_after, rank_after) = standing_in(&after, &role_id).ok_or_else(unknown)?;
        // what the row grants as it reads, which is nothing on a removed member's row, and what it
        // will grant once this signs it.
        let effective_before = row.effective;
        let effective_after = if row.removed_at.is_some() {
            0
        } else {
            permission::effective(mask_after, override_mask)
        };

        if role_id == row.role_id
            && override_mask == row.override_mask
            && effective_before == effective_after
            && rank_before == rank_after
        {
            continue;
        }

        // the owner's role is the constant and the owner's row is refused by every command that
        // could name it, so a change reaching it is a defect rather than a refusal.
        if row.role_id == permission::OWNER || role_id == permission::OWNER {
            return Err(Error::Integrity {
                message: "a change to roles reached the owner's row".to_string(),
            });
        }

        if row.removed_at.is_none() {
            refuse_owner_only(override_mask | effective_after)?;
            refuse_unheld(actor, effective_before ^ effective_after)?;

            // and what the member ends up with adds, edits or deletes no kind of record they
            // cannot view, whether their role or their override moved it (requirement 6, as
            // amended 2026-09-27).
            if effective_before != effective_after {
                permission::refuse_write_without_view(effective_after, "a member this changes")?;
            }
        }

        moved.push(Moved {
            row,
            role_id,
            override_mask,
            effective: effective_after,
            rank: rank_after,
        });
    }

    // the members whose workspace overrides go with the act: those it clears, and every holder of
    // a role it deletes whose row it moves. What each of those overrides pins, it unpins, so every
    // flag pinned is one the actor holds (requirement 7).
    let cleared: Vec<&str> = change
        .cleared
        .iter()
        .map(String::as_str)
        .chain(
            moved
                .iter()
                .filter(|moving| change.deleted.contains(&moving.row.role_id))
                .map(|moving| moving.row.id.as_str()),
        )
        .collect();

    if !cleared.is_empty() {
        for workspace_override in store
            .workspace_overrides(&session.verifying_key)
            .await?
            .iter()
            .filter(|workspace_override| cleared.contains(&workspace_override.member_id.as_str()))
        {
            refuse_unheld(actor, workspace_override.pinned)?;
        }
    }

    let (key, certificate) = signer_of(store, session).await?;
    let signer = Signer {
        key: &key,
        certificate: &certificate,
    };

    // a member row is signed only by a certificate that administers members, and a certificate is
    // issued only by one; refused by name here rather than as a row nobody could verify.
    if !moved.is_empty()
        && !permission::MEMBER_ADMINISTRATION
            .iter()
            .any(|flag| permission::permits(certificate.ceiling, *flag))
    {
        return Err(Error::refused(
            RefusalReason::RoleLacksAct,
            "this moves members, whose rows and certificates are signed again by you, and you \
             hold no flag that administers members. nothing was changed",
        ));
    }

    // and every row this signs sits inside the actor's certificate (effort 838, the row-kind
    // table): a role row carries no flag it does not, the ones it only renames or renumbers
    // included, and a member row's override switches none for anybody, a removed member's
    // included. The gates above hold the flags this changes; these are the flags it leaves where
    // they were and signs again. The role's own mask a member row names is its role row's to
    // vouch for, and the certificate each holder is issued below is what holds it to the actor's.
    for role in &change.roles {
        if let Some(flag) = permission::first_not_held(certificate.ceiling, role.mask) {
            return Err(Error::refused(
                RefusalReason::RoleLacksAct,
                format!(
                    "a role this writes carries {flag}, and you do not, so its row cannot be \
                     signed by you. nothing was changed"
                ),
            ));
        }
    }

    for moving in &moved {
        if let Some(flag) = permission::first_not_held(certificate.ceiling, moving.override_mask) {
            return Err(Error::refused(
                RefusalReason::RoleLacksAct,
                format!(
                    "a member this moves has {flag} switched for them, and you do not hold it, so \
                     their row cannot be signed by you. nothing was changed"
                ),
            ));
        }
    }

    in_one_transaction(store, async {
        for member_id in &cleared {
            store.delete_workspace_overrides_of(member_id).await?;
        }

        for moving in &moved {
            store
                .write_member(
                    &signer,
                    &MemberRecord {
                        role_id: moving.role_id.clone(),
                        override_mask: moving.override_mask,
                        effective: moving.effective,
                        updated_at: now,
                        ..moving.row.clone()
                    },
                )
                .await?;
        }

        for role in &change.roles {
            store.write_role(&signer, role).await?;
        }

        for role_id in &change.deleted {
            store.delete_role(role_id).await?;
        }

        for moving in moved
            .iter()
            .filter(|moving| moving.row.removed_at.is_none())
        {
            reissue_within(
                store,
                session,
                &signer,
                &moving.row.id,
                Some((
                    &moving.row.signing_public_key,
                    Standing {
                        role_id: &moving.role_id,
                        override_mask: moving.override_mask,
                        effective: moving.effective,
                        rank: moving.rank,
                    },
                )),
                now,
            )
            .await?;
        }

        Ok(())
    })
    .await?;

    Ok(())
}
