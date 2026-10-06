//! the organization's name: the one rule it is held to, at setup and at a rename, and the owner's
//! rename (effort 851, requirements 22 to 28).

use crate::{
    diagnostics,
    error::{Error, RefusalReason},
};

use crate::organization::{
    member::vault::seal_content,
    session::MemberSession,
    store::{OrganizationNameRecord, OrganizationRecord, OrganizationStore, Signer},
    workspace::{require_owner_alone, signer_of},
};

/// The longest name an organization may have, in characters. `ORGANIZATION_NAME_LIMIT` in
/// `src/lib/organization/setup/setup.ts` is the same number, which the walk's field and the rename
/// form refuse a longer name by first.
pub const ORGANIZATION_NAME_LIMIT: usize = 120;

/// The name as it is stored: trimmed, and refused where nothing is left or where it is longer than
/// [`ORGANIZATION_NAME_LIMIT`] (effort 851, requirement 23). **One rule for both places a name is
/// typed**, the walk's name step and the owner's rename, so the two cannot come to disagree.
pub(crate) fn organization_name(name: &str) -> Result<&str, Error> {
    let name = name.trim();

    if name.is_empty() {
        return Err(Error::refused(
            RefusalReason::OrganizationNameMissing,
            "the organization needs a name",
        ));
    }

    if name.chars().count() > ORGANIZATION_NAME_LIMIT {
        return Err(Error::refused(
            RefusalReason::OrganizationNameTooLong,
            format!(
                "the organization's name can be at most {ORGANIZATION_NAME_LIMIT} characters long"
            ),
        ));
    }

    Ok(name)
}

/// Rename the organization, as its owner, and send it (effort 851, requirements 22 to 28). Answers
/// the name as stored.
///
/// **The owner's alone, and no flag says so** ([`require_owner_alone`]): the owner's role always
/// carries everything, so no `renameOrganization` flag exists for a role or an override to carry,
/// and anybody else is refused on their verified row whatever the interface drew (requirement 24).
///
/// **One sealed name, written twice.** The signed row (`organization_name`) is what every machine
/// of this build reads, under the root's signature, so a name nobody but the owner wrote is never
/// shown (requirement 29). The unsigned column on `organization` gets the same sealed bytes, so a
/// member on an earlier build, which reads only the column, sees the rename too, and a link made
/// after it carries the new name, which a link reads from the signed row
/// (`invitation::locator`, requirement 28). A link made before it still joins: it carries the
/// organization's id and key, and the name in it is only what a refusal is said in the name of
/// (requirement 27).
///
/// A replica made before the signed name (one an earlier build pulled, not yet completed) is
/// completed first, so the signed row has a table to go in.
///
/// **The new name is signed after the one it replaces**, at `now` or just past the name that
/// verifies, whichever is later: a machine reads a signed name older than the last one it read as
/// rolled back (`HeldOrganization::name_signed_at`), so a rename from an owner's machine whose
/// clock runs behind would otherwise be read as one.
pub async fn rename_organization(
    store: &OrganizationStore,
    session: &MemberSession,
    name: &str,
    now: i64,
) -> Result<String, Error> {
    session.settled()?;
    require_owner_alone(
        store,
        session,
        "only the owner can rename the organization. ask the owner",
    )
    .await?;

    let name = organization_name(name)?;
    let organization = store
        .organization()
        .await?
        .ok_or_else(|| Error::Integrity {
            message: "the organization replica holds no organization row".to_string(),
        })?;

    if !store
        .tables()
        .await?
        .iter()
        .any(|table| table == "organization_name")
    {
        store.complete_schema().await?;
    }

    let signed_at = match store.organization_name(&session.verifying_key).await? {
        Some(current) => now.max(current.updated_at.saturating_add(1)),
        None => now,
    };
    let (key, certificate) = signer_of(store, session).await?;
    let name_sealed = seal_content(
        &session.content_key,
        "organization.name_sealed",
        name.as_bytes(),
    )?;

    store
        .write_organization_name(
            &Signer {
                key: &key,
                certificate: &certificate,
            },
            &OrganizationNameRecord {
                name_sealed: name_sealed.clone(),
                updated_at: signed_at,
            },
        )
        .await?;
    store
        .write_organization(&OrganizationRecord {
            name_sealed,
            ..organization
        })
        .await?;

    if !store.push().await {
        diagnostics::warn("organization.name.renameNotYetSent").write();
    }

    Ok(name.to_string())
}

#[cfg(test)]
mod tests {
    use super::{ORGANIZATION_NAME_LIMIT, organization_name};
    use crate::error::{Error, RefusalReason};

    fn reason_of(refusal: Error) -> RefusalReason {
        match refusal {
            Error::Refused { reason, .. } => reason,
            other => panic!("not a refusal: {other:?}"),
        }
    }

    /// **Criterion 23, the rule.** A name is trimmed; blank and whitespace are refused as missing,
    /// one character past the limit as too long, and the limit itself is a name, counted in
    /// characters rather than bytes, so an Arabic name has the same room an English one has.
    #[test]
    fn a_name_is_trimmed_and_held_to_the_limit() {
        assert_eq!(
            organization_name("  Acme Rentals \n").expect("a name"),
            "Acme Rentals"
        );

        for blank in ["", "   ", "\t\n"] {
            assert_eq!(
                reason_of(organization_name(blank).expect_err(blank)),
                RefusalReason::OrganizationNameMissing,
                "{blank:?}"
            );
        }

        for (long, at_the_limit) in [
            (
                "n".repeat(ORGANIZATION_NAME_LIMIT + 1),
                "n".repeat(ORGANIZATION_NAME_LIMIT),
            ),
            (
                "ن".repeat(ORGANIZATION_NAME_LIMIT + 1),
                "ن".repeat(ORGANIZATION_NAME_LIMIT),
            ),
        ] {
            assert_eq!(
                reason_of(organization_name(&long).expect_err("too long")),
                RefusalReason::OrganizationNameTooLong
            );
            assert_eq!(
                organization_name(&format!(" {at_the_limit} ")).expect("at the limit"),
                at_the_limit
            );
        }
    }
}
