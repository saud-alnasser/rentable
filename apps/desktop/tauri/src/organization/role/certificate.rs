//! the certificate that follows a change of standing, in the same act (effort 838, requirement 9):
//! issued afresh from the actor's, with what the old one signed re-signed and what it issued issued
//! again before it is revoked, all in one transaction.

use crate::error::{Error, RefusalReason};

use super::permission::{self};
use crate::organization::{
    authority::{
        Certificate, Chain, Issue, VERIFYING_KEY_BYTES, issue_certificate, revoke,
        unused_certificate_id,
    },
    session::MemberSession,
    store::{OrganizationStore, Signer},
};

/// Where a member stands in the chain: the one role they hold, their override, what the two give
/// them, and the rank of the role.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(in crate::organization) struct Standing<'a> {
    pub role_id: &'a str,
    pub override_mask: i64,
    pub effective: i64,
    pub rank: i64,
}

/// Run `act` inside one transaction on this replica: every write it makes lands, or none does.
///
/// **What makes a refusal part way an act that did nothing** (effort 838). A role edit writes a
/// role row, the rows of everybody who holds it, a certificate and a revocation per holder and the
/// rows each old certificate signed; the last holder's certificate being one the actor cannot
/// issue has to leave the first holder's as it was.
pub(crate) async fn in_one_transaction<T>(
    store: &OrganizationStore,
    act: impl Future<Output = Result<T, Error>>,
) -> Result<T, Error> {
    store.begin().await?;

    match act.await {
        Ok(value) => {
            store.commit().await?;

            Ok(value)
        }
        Err(error) => {
            let _ = store.rollback().await;

            Err(error)
        }
    }
}

/// Re-issue a member's certificate: issue a fresh one for their standing, and retire every older
/// one after re-signing what it signed and issuing again what it issued (effort 838). **All of it
/// in one transaction**, so a refusal or a failure part way leaves the chain as it was.
///
/// `signing` is the member's signing key and their standing, or `None` for a member who is to hold
/// no certificate, which is a removed one: every live one they hold is retired and none is issued.
/// [`reissue_within`] says what the rest does.
pub(in crate::organization) async fn reissue(
    store: &OrganizationStore,
    session: &MemberSession,
    signer: &Signer<'_>,
    member_id: &str,
    signing: Option<(&[u8; VERIFYING_KEY_BYTES], Standing<'_>)>,
    now: i64,
) -> Result<(), Error> {
    in_one_transaction(
        store,
        reissue_within(store, session, signer, member_id, signing, now),
    )
    .await
}

/// [`reissue`]'s writes, for a caller that holds the transaction itself.
///
/// The new certificate is issued down from `signer`'s, carrying the member's effective permissions
/// as its ceiling and their role's rank, so the issue itself refuses a standing wider or higher
/// than the actor's (`authority::issue_certificate`). Where the member already holds exactly one
/// live certificate naming that key, ceiling and rank, nothing is written: **every live member
/// holds exactly one live certificate**, and this is what keeps it one.
///
/// **What an old certificate issued is issued again, from the actor's, before it is revoked.** A
/// revocation retires everything below the certificate it names, so a member whose standing moved
/// would otherwise take with them every certificate they had issued, and every row signed under
/// those. Each is issued again under its own id with its own fields, as the handover issues the
/// founder's ([`accept_ownership`](crate::organization::ownership::accept_ownership)), so every row it signed goes on verifying and nothing further
/// down moves; one the actor's certificate could not have issued, a flag beyond theirs or a rank
/// not below them, refuses the whole act by name.
///
/// **Refused, naming what is needed, where the actor could not sign a row the old certificate
/// signed** (`store::re_sign_rows_of_certificate`): re-signing a grant needs `grantWorkspace`, and
/// deleting it instead would take somebody's access away.
pub(in crate::organization) async fn reissue_within(
    store: &OrganizationStore,
    session: &MemberSession,
    signer: &Signer<'_>,
    member_id: &str,
    signing: Option<(&[u8; VERIFYING_KEY_BYTES], Standing<'_>)>,
    now: i64,
) -> Result<(), Error> {
    let live = store
        .live_certificates(&session.verifying_key, member_id)
        .await?;
    let in_step = |certificate: &Certificate| {
        signing.is_some_and(|(key, standing)| {
            &certificate.signing_public_key == key
                && certificate.ceiling == standing.effective
                && certificate.rank == standing.rank
        })
    };

    if (signing.is_some() && live.len() == 1 && in_step(&live[0]))
        || (signing.is_none() && live.is_empty())
    {
        return Ok(());
    }

    let issued_at = now.to_string();

    if let Some((signing_public_key, standing)) = signing {
        if let Some(flag) =
            permission::first_not_held(signer.certificate.ceiling, standing.effective)
        {
            return Err(Error::refused(
                RefusalReason::RoleLacksAct,
                format!(
                    "their permissions would include {flag}, and yours do not, so their \
                     certificate cannot be issued from yours. nothing was changed"
                ),
            ));
        }

        let id = unused_certificate_id(&store.certificates().await?, member_id, &issued_at);

        store
            .write_certificate(&issue_certificate(
                signer.key,
                signer.certificate,
                Issue {
                    id: &id,
                    member_id,
                    signing_public_key,
                    ceiling: standing.effective,
                    rank: standing.rank,
                    issued_at: &issued_at,
                },
            )?)
            .await?;
    }

    for old in &live {
        reissue_what_it_issued(store, session, signer, old).await?;
        store
            .re_sign_rows_of_certificate(&session.verifying_key, &old.id, signer)
            .await?;
        store
            .write_revocation(&revoke(signer.key, signer.certificate, old, &issued_at)?)
            .await?;
    }

    Ok(())
}

/// Issue again, from `signer`'s certificate, every live certificate `old` issued: under the same
/// id, for the same key, with the same ceiling, rank and moment, so the rows each signed and the
/// certificates each issued in turn stand as they were once `old` is revoked.
pub(in crate::organization) async fn reissue_what_it_issued(
    store: &OrganizationStore,
    session: &MemberSession,
    signer: &Signer<'_>,
    old: &Certificate,
) -> Result<(), Error> {
    let (certificates, revocations) = store.chain_rows().await?;
    let chain = Chain::new(&session.verifying_key, &certificates, &revocations);
    let issued: Vec<&Certificate> = certificates
        .iter()
        .filter(|certificate| {
            certificate.issuer_certificate_id.as_deref() == Some(old.id.as_str())
                && chain.live(&certificate.id).is_ok()
        })
        .collect();

    for certificate in issued {
        if let Some(flag) =
            permission::first_not_held(signer.certificate.ceiling, certificate.ceiling)
        {
            return Err(Error::refused(
                RefusalReason::RoleLacksAct,
                format!(
                    "a certificate their old one issued carries {flag}, and yours does not, so it \
                     cannot be issued again from yours. nothing was changed"
                ),
            ));
        }

        if certificate.rank >= signer.certificate.rank {
            return Err(Error::refused(
                RefusalReason::RankNotAbove,
                "a certificate their old one issued does not rank below yours, so it cannot be \
                 issued again from yours. nothing was changed",
            ));
        }

        store
            .write_certificate(&issue_certificate(
                signer.key,
                signer.certificate,
                Issue {
                    id: &certificate.id,
                    member_id: &certificate.member_id,
                    signing_public_key: &certificate.signing_public_key,
                    ceiling: certificate.ceiling,
                    rank: certificate.rank,
                    issued_at: &certificate.issued_at,
                },
            )?)
            .await?;
    }

    Ok(())
}
