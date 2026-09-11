//! inviting a member: a row they will sign in to, a link that finds it, and a password that opens it.
//!
//! **The application sends no mail.** We have registered with no mail service and the spec's
//! constraints forbid registering one on the customer's behalf, so an invitation is two things
//! the administrator hands over themselves: a link and a generated password. The interface says
//! so and shows both once.
//!
//! **What an invitation makes.** A member row with a vault sealed under the generated password
//! and `must_change_password` set, so the first sign-in is a change; the content key sealed to
//! the new member's public key; a grant on the organization database, which is the inviter's own
//! credential re-sealed, so the member can pull the directory once their vault is open; a grant on
//! each workspace named, the same way, so an administrator invites into what they can reach
//! themselves; and an invitation row whose payload, the member's own id, opens only with the
//! link's secret and the person's password together. An administrator who invites an
//! administrator needs the organization key to certify them, and only the owner's vault yields
//! it, so that is refused for anybody else and says why.
//!
//! **The generated password is drawn, never derived.** Twenty characters from a thirty-two
//! character alphabet, drawn from the operating system, spelled in groups a person can read out
//! or type; nothing about the email or the display name enters it, and a test asserts that rather
//! than asserting the two merely differ.
//!
//! **An invitation expires; the link does not** (requirement 23). The row carries the lifetime.
//! A link opened after it lapsed still finds the organization, because the link is a locator, and
//! is told the invitation lapsed. Revoking is deleting the row, and the link then finds nothing to
//! open; reissuing is a fresh invitation for the same member, which rewrites their vault under a
//! new password and re-seals what the reissuer can reach, and it is the path a reset takes.

use serde::{Deserialize, Serialize};

use crate::{diagnostics, error::Error, sync::turso::platform::AccessLevel};

use super::{
    authority::{AdministratorKey, OrganizationKey, issue_certificate},
    link::JoinLink,
    permission::{self, Administration},
    session::MemberSession,
    setup::{ADMINISTRATOR_KEY_PURPOSE, ORGANIZATION_KEY_PURPOSE, SHIPPING_KDF, credential_expiry},
    store::{GrantRecord, InvitationRecord, MemberRecord, OrganizationStore, Signer},
    vault::{
        INVITATION_SECRET_BYTES, KdfParams, create_vault_with_secret, open_content, seal_content,
        seal_invitation, seal_to_public_key,
    },
    workspace::signer_of,
};

/// How long an invitation stands: a week, which is long enough to send a link on Friday and have
/// it opened on Monday, and short enough that a link in an old message is not a way in.
pub const INVITATION_LIFETIME_MS: i64 = 7 * 24 * 60 * 60 * 1000;

/// The alphabet a generated password is spelled in: lowercase and digits with the four that read
/// alike removed, `0`, `o`, `1` and `l`, so what is read out over a phone is what is typed.
const PASSWORD_ALPHABET: &[u8] = b"abcdefghijkmnpqrstuvwxyz23456789";
const PASSWORD_GROUPS: usize = 4;
const PASSWORD_GROUP_LENGTH: usize = 5;

/// What an invitation makes, shown to the administrator once. The password is in it because it
/// has to be shown; it is nowhere else and crosses to the web layer exactly once.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Invited {
    pub member_id: String,
    pub invitation_id: String,
    pub join_link: String,
    pub generated_password: String,
    pub expires_at: i64,
}

/// What the dashboard lists for one invitation.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvitationFacts {
    pub id: String,
    pub member_id: String,
    pub expires_at: i64,
    pub consumed_at: Option<i64>,
    pub created_at: i64,
    pub standing: InvitationStanding,
}

/// Where an invitation stands, which is what a link opened against it is told.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InvitationStanding {
    /// open, and a password opens it.
    Open,
    /// past its lifetime. The link still finds the organization; the invitation is what lapsed.
    Lapsed,
    /// already used to sign in once.
    Consumed,
}

impl InvitationStanding {
    pub fn of(invitation: &InvitationRecord, now: i64) -> Self {
        if invitation.consumed_at.is_some() {
            Self::Consumed
        } else if invitation.expires_at <= now {
            Self::Lapsed
        } else {
            Self::Open
        }
    }
}

/// What the inviter is asked for.
#[derive(Clone, Debug)]
pub struct Invitation<'a> {
    pub email: &'a str,
    pub display_name: &'a str,
    /// `packages/workspace-permission`'s vocabulary: `administrator` or `member`.
    pub role: &'a str,
    /// the workspaces the member belongs to, granted at full access from the inviter's own.
    pub workspace_ids: &'a [String],
}

/// Invite a member.
///
/// `link` is the organization's own locator, the one the first run produced, which the
/// invitation's half is added to; `kdf_params` is what the member's vault is sealed at.
pub async fn invite_member(
    store: &OrganizationStore,
    session: &MemberSession,
    link: &JoinLink,
    invitation: Invitation<'_>,
    kdf_params: KdfParams,
    now: i64,
) -> Result<Invited, Error> {
    session.settled()?;
    permission::require(session.permissions, Administration::InviteMember)?;

    let email = invitation.email.trim();
    let display_name = invitation.display_name.trim();

    if email.is_empty() || !email.contains('@') {
        return Err(Error::InvalidInput {
            message: "the member needs an email address".to_string(),
        });
    }

    if display_name.is_empty() {
        return Err(Error::InvalidInput {
            message: "the member needs a name".to_string(),
        });
    }

    if invitation.role != permission::ADMINISTRATOR && invitation.role != permission::MEMBER {
        return Err(Error::InvalidInput {
            message: "a member is invited as an administrator or as a member".to_string(),
        });
    }

    let member_id = random_id()?;

    issue(
        store,
        session,
        link,
        &member_id,
        email,
        display_name,
        invitation.role,
        invitation.workspace_ids,
        kdf_params,
        now,
    )
    .await
}

/// Invite a member again: a fresh vault under a fresh password, the content key and every grant
/// the reissuer can reach re-sealed to it, and a fresh invitation. The member's row keeps its id,
/// its address, its name and its role.
///
/// **This is what a reset is** (requirement 13): no escrow copy of the old vault exists, so what
/// restores a member's access is building them a new one from what the reissuer already holds,
/// and a workspace the reissuer cannot reach is one the member waits on somebody who can.
pub async fn reissue_invitation(
    store: &OrganizationStore,
    session: &MemberSession,
    link: &JoinLink,
    member_id: &str,
    kdf_params: KdfParams,
    now: i64,
) -> Result<Invited, Error> {
    session.settled()?;
    permission::require(session.permissions, Administration::InviteMember)?;

    let members = store.members(&session.verifying_key).await?;
    let member = members
        .iter()
        .find(|member| member.id == member_id)
        .ok_or_else(|| Error::NotFound {
            message: "that member is not in this organization".to_string(),
        })?;

    if member.role == permission::OWNER {
        return Err(Error::Forbidden {
            message: "an owner is not reissued an invitation. their vault is theirs alone"
                .to_string(),
        });
    }

    let email = opened(session, "member.email_sealed", &member.email_sealed)?;
    let display_name = opened(
        session,
        "member.display_name_sealed",
        &member.display_name_sealed,
    )?;
    let role = member.role.clone();
    let workspace_ids: Vec<String> = store
        .grants(&session.verifying_key)
        .await?
        .into_iter()
        .filter(|grant| {
            grant.member_id == member_id && grant.workspace_id != session.organization_id
        })
        .map(|grant| grant.workspace_id)
        .collect();

    // any invitation still standing for them goes: one open invitation per member.
    for stale in store
        .invitations(&session.verifying_key)
        .await?
        .into_iter()
        .filter(|invitation| invitation.member_id == member_id)
    {
        store.delete_invitation(&stale.id).await?;
    }

    issue(
        store,
        session,
        link,
        member_id,
        &email,
        &display_name,
        &role,
        &workspace_ids,
        kdf_params,
        now,
    )
    .await
}

/// Revoke an unused invitation: the row goes, and the link stops opening anything.
pub async fn revoke_invitation(
    store: &OrganizationStore,
    session: &MemberSession,
    invitation_id: &str,
) -> Result<(), Error> {
    session.settled()?;
    permission::require(session.permissions, Administration::InviteMember)?;

    let exists = store
        .invitations(&session.verifying_key)
        .await?
        .iter()
        .any(|invitation| invitation.id == invitation_id);

    if !exists {
        return Err(Error::NotFound {
            message: "that invitation is not in this organization".to_string(),
        });
    }

    store.delete_invitation(invitation_id).await?;

    if !store.push().await {
        diagnostics::warn("organization.invitation.revocationNotYetSent")
            .with("invitation", invitation_id)
            .write();
    }

    Ok(())
}

/// One member as the dashboard lists them: names opened with the content key, and the workspaces
/// they hold a grant on. No key and no credential.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberFacts {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub role: String,
    pub permissions: i64,
    pub must_change_password: bool,
    pub workspace_ids: Vec<String>,
    pub created_at: i64,
}

/// Every member, verified, with the names opened for the screen.
pub async fn members(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<Vec<MemberFacts>, Error> {
    let grants = store.grants(&session.verifying_key).await?;

    store
        .members(&session.verifying_key)
        .await?
        .into_iter()
        .map(|member| {
            Ok(MemberFacts {
                email: opened(session, "member.email_sealed", &member.email_sealed)?,
                display_name: opened(
                    session,
                    "member.display_name_sealed",
                    &member.display_name_sealed,
                )?,
                workspace_ids: grants
                    .iter()
                    .filter(|grant| {
                        grant.member_id == member.id
                            && grant.workspace_id != session.organization_id
                    })
                    .map(|grant| grant.workspace_id.clone())
                    .collect(),
                id: member.id,
                role: member.role,
                permissions: member.permissions,
                must_change_password: member.must_change_password,
                created_at: member.created_at,
            })
        })
        .collect()
}

/// Every invitation with where it stands now.
pub async fn invitations(
    store: &OrganizationStore,
    session: &MemberSession,
    now: i64,
) -> Result<Vec<InvitationFacts>, Error> {
    Ok(store
        .invitations(&session.verifying_key)
        .await?
        .into_iter()
        .map(|invitation| InvitationFacts {
            standing: InvitationStanding::of(&invitation, now),
            id: invitation.id,
            member_id: invitation.member_id,
            expires_at: invitation.expires_at,
            consumed_at: invitation.consumed_at,
            created_at: invitation.created_at,
        })
        .collect())
}

/// Draw a generated password. Twenty characters, four groups of five, from bytes the operating
/// system drew; nothing about the person enters it.
pub fn generate_password() -> Result<String, Error> {
    let mut bytes = [0_u8; PASSWORD_GROUPS * PASSWORD_GROUP_LENGTH];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw a password: {error}"),
    })?;

    let letters: Vec<char> = bytes
        .iter()
        .map(|byte| PASSWORD_ALPHABET[(*byte as usize) % PASSWORD_ALPHABET.len()] as char)
        .collect();

    Ok(letters
        .chunks(PASSWORD_GROUP_LENGTH)
        .map(|group| group.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join("-"))
}

#[allow(clippy::too_many_arguments)]
async fn issue(
    store: &OrganizationStore,
    session: &MemberSession,
    link: &JoinLink,
    member_id: &str,
    email: &str,
    display_name: &str,
    role: &str,
    workspace_ids: &[String],
    kdf_params: KdfParams,
    now: i64,
) -> Result<Invited, Error> {
    let (key, certificate) = signer_of(store, session).await?;
    let signer = Signer {
        key: &key,
        certificate: &certificate,
    };

    // the member's vault, under a password the inviter will hand over and the member will change.
    let generated_password = generate_password()?;
    let (vault, secret) = create_vault_with_secret(&generated_password, kdf_params)?;

    // an administrator's signing key is derived from their secret as the owner's is, and the
    // certificate over it needs the organization key, which only the owner's vault yields.
    if role == permission::ADMINISTRATOR {
        if session.role != permission::OWNER {
            return Err(Error::Forbidden {
                message:
                    "only an owner invites an administrator, because certifying one needs the \
                          organization key. ask the owner"
                        .to_string(),
            });
        }

        let organization_key =
            OrganizationKey::from_bytes(&session.secret.derive_seed(ORGANIZATION_KEY_PURPOSE)?);
        let administrator_key =
            AdministratorKey::from_bytes(&secret.derive_seed(ADMINISTRATOR_KEY_PURPOSE)?);

        store
            .write_certificate(&issue_certificate(
                &organization_key,
                &format!("cert-{member_id}"),
                member_id,
                &administrator_key.verifying_key(),
                &now.to_string(),
            ))
            .await?;
    }

    store
        .write_member(
            &signer,
            &MemberRecord {
                id: member_id.to_string(),
                email_sealed: seal_content(
                    &session.content_key,
                    "member.email_sealed",
                    email.as_bytes(),
                )?,
                display_name_sealed: seal_content(
                    &session.content_key,
                    "member.display_name_sealed",
                    display_name.as_bytes(),
                )?,
                sealed_content_key: seal_to_public_key(
                    &vault.public_key,
                    &session.content_key.to_bytes(),
                )?,
                vault: vault.clone(),
                role: role.to_string(),
                permissions: permission::mask_of_role(role),
                must_change_password: true,
                created_at: now,
                updated_at: now,
            },
        )
        .await?;

    // the directory: the inviter's own credential on the organization database, re-sealed.
    let organization_credential = session
        .organization_credential
        .lock()
        .ok()
        .and_then(|slot| slot.clone())
        .ok_or_else(|| Error::PreconditionFailed {
            message: "this machine holds no credential to the organization database to hand on"
                .to_string(),
        })?;

    store
        .write_grant(
            &signer,
            &GrantRecord {
                member_id: member_id.to_string(),
                workspace_id: session.organization_id.clone(),
                sealed_credential: seal_to_public_key(
                    &vault.public_key,
                    organization_credential.as_bytes(),
                )?,
                access_level: AccessLevel::FullAccess.as_str().to_string(),
                credential_expires_at: credential_expiry(&organization_credential),
            },
        )
        .await?;

    // the workspaces: what the inviter reaches, re-sealed. One they do not is refused by name
    // rather than skipped, so an invitation never quietly grants less than it was asked to.
    for workspace_id in workspace_ids {
        let held = session
            .workspace_credentials
            .get(workspace_id)
            .filter(|held| held.access == AccessLevel::FullAccess)
            .ok_or_else(|| Error::Forbidden {
                message: "you can invite into a workspace you hold full access to yourself, and \
                          no other"
                    .to_string(),
            })?;

        store
            .write_grant(
                &signer,
                &GrantRecord {
                    member_id: member_id.to_string(),
                    workspace_id: workspace_id.clone(),
                    sealed_credential: seal_to_public_key(
                        &vault.public_key,
                        held.token.as_bytes(),
                    )?,
                    access_level: AccessLevel::FullAccess.as_str().to_string(),
                    credential_expires_at: credential_expiry(&held.token),
                },
            )
            .await?;
    }

    // the invitation: its payload names the member row, and opens only with both halves.
    let invitation_id = random_id()?;
    let mut invitation_secret = [0_u8; INVITATION_SECRET_BYTES];

    getrandom::fill(&mut invitation_secret).map_err(|error| Error::Internal {
        message: format!("failed to draw an invitation secret: {error}"),
    })?;

    let payload = serde_json::to_vec(&InvitationPayload {
        member_id: member_id.to_string(),
    })
    .map_err(|error| Error::Internal {
        message: format!("failed to encode an invitation: {error}"),
    })?;
    let sealed = seal_invitation(
        &invitation_secret,
        &generated_password,
        kdf_params,
        &payload,
    )?;
    let expires_at = now + INVITATION_LIFETIME_MS;

    store
        .write_invitation(
            &signer,
            &InvitationRecord {
                id: invitation_id.clone(),
                member_id: member_id.to_string(),
                sealed,
                expires_at,
                consumed_at: None,
                created_at: now,
            },
        )
        .await?;

    if !store.push().await {
        diagnostics::warn("organization.invitation.notYetSent")
            .with("invitation", invitation_id.as_str())
            .write();
    }

    diagnostics::info("organization.invitation.issued")
        .with("member", member_id)
        .with("role", role)
        .write();

    Ok(Invited {
        member_id: member_id.to_string(),
        join_link: link
            .clone()
            .for_invitation(&invitation_id, &invitation_secret)
            .encode()?,
        invitation_id,
        generated_password,
        expires_at,
    })
}

/// What the sealed payload carries: which member row the invitation is for, and nothing that is
/// useful without the vault the row holds.
#[derive(Serialize, Deserialize)]
pub struct InvitationPayload {
    pub member_id: String,
}

fn opened(session: &MemberSession, column: &str, sealed: &[u8]) -> Result<String, Error> {
    String::from_utf8(open_content(&session.content_key, column, sealed)?).map_err(|_| {
        Error::Integrity {
            message: format!("{column} did not open as text"),
        }
    })
}

fn random_id() -> Result<String, Error> {
    let mut bytes = [0_u8; 16];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw an id: {error}"),
    })?;

    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

/// The shipping cost a member's vault is sealed at when they are invited, the same as the owner's.
pub const INVITED_KDF: KdfParams = SHIPPING_KDF;

/// The organization's own locator, rebuilt from what the replica holds: the link every invitation
/// is made from. The read-only credential it carries is sealed under the content key on the
/// organization row, so any member whose vault is open can make a link and nobody holding the
/// database alone can read it.
pub async fn organization_link(
    store: &OrganizationStore,
    session: &MemberSession,
) -> Result<JoinLink, Error> {
    let organization = store
        .organization()
        .await?
        .ok_or_else(|| Error::Integrity {
            message: "the organization replica holds no organization row".to_string(),
        })?;
    let name = opened(
        session,
        "organization.name_sealed",
        &organization.name_sealed,
    )?;
    let credential = opened(
        session,
        "organization.link_credential_sealed",
        &organization.link_credential_sealed,
    )?;

    Ok(JoinLink::new(
        &organization.id,
        &name,
        &session.verifying_key,
        &organization.remote_url,
        &credential,
    ))
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;

    use super::{
        INVITATION_LIFETIME_MS, Invitation, InvitationPayload, InvitationStanding,
        generate_password, invitations, invite_member, organization_link, reissue_invitation,
        revoke_invitation,
    };
    use crate::{
        organization::{
            JoinedOrganization,
            link::JoinLink,
            migrate::Pipeline,
            permission,
            session::{CredentialSlot, MemberSession, sign_in},
            setup::{CreateOrganization, Remote, create_organization},
            store::OrganizationStore,
            vault::{KdfParams, open_invitation},
            workspace::create_workspace,
        },
        persisted::Persisted,
        sync::{
            RemoteSyncStore,
            google::test::server::{ScriptedResponse, ScriptedServer},
            turso::{discovery::McpEndpoint, platform::InMemoryPlatform},
        },
    };

    const PASSWORD: &str = "the owners password";

    fn test_cost() -> KdfParams {
        KdfParams {
            memory_kib: 1024,
            iterations: 2,
            lanes: 1,
        }
    }

    fn scratch(name: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let directory = std::env::temp_dir().join(format!("rentable-invite-{name}-{nanos:x}"));
        std::fs::create_dir_all(&directory).expect("scratch directory");

        directory
    }

    fn slot() -> CredentialSlot {
        Arc::new(Mutex::new(None))
    }

    /// The machine's record of a member who joined, as the join ticket will write one.
    fn joined_as(owner: &MemberSession, member_id: &str, role: &str) -> JoinedOrganization {
        JoinedOrganization {
            id: owner.organization_id.clone(),
            name: "Acme".to_string(),
            verifying_key: base64::Engine::encode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                owner.verifying_key,
            ),
            remote_url: String::new(),
            member_id: member_id.to_string(),
            role: role.to_string(),
            joined_at: 0,
        }
    }

    /// An organization with its owner signed in and one workspace, on a fake account.
    async fn owned(
        directory: &std::path::Path,
    ) -> (OrganizationStore, MemberSession, JoinLink, String) {
        let mut store = Persisted::<RemoteSyncStore>::load(directory.join("remote-sync.json"))
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

        let (created, organization) = create_organization(
            &mut store,
            "a-platform-token",
            &McpEndpoint::at(&mcp.url("")),
            |_| Arc::clone(&platform),
            Remote::none(),
            &directory.join("app.db"),
            CreateOrganization {
                name: "Acme",
                password: PASSWORD,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the first run failed");
        let joined = store.organizations[0].clone();
        let mut owner = sign_in(&organization, &joined, PASSWORD, &slot())
            .await
            .expect("the owner did not sign in");
        let pipeline = ScriptedServer::start(vec![ScriptedResponse::new(
            200,
            json!({ "results": [] }).to_string(),
        )])
        .await;
        let workspace = create_workspace(
            &organization,
            &mut owner,
            &platform,
            |_| Pipeline::at(&pipeline.url("")),
            "North",
            1_757_000_000_000,
        )
        .await
        .expect("the workspace");
        let link = organization_link(&organization, &owner)
            .await
            .expect("the organization's link");

        assert_eq!(
            JoinLink::decode(&created.join_link).expect("the first run's link"),
            link,
            "the link rebuilt from the replica is the one the first run produced"
        );

        (organization, owner, link, workspace.id)
    }

    #[tokio::test]
    async fn an_invitation_makes_a_member_a_link_and_a_password_and_both_halves_open_it() {
        let directory = scratch("invite");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let workspaces = vec![workspace_id.clone()];

        let invited = invite_member(
            &store,
            &owner,
            &link,
            Invitation {
                email: " sami@acme.example ",
                display_name: "Sami Staff",
                role: permission::MEMBER,
                workspace_ids: &workspaces,
            },
            test_cost(),
            1_757_000_000_000,
        )
        .await
        .expect("the invitation failed");

        assert_eq!(
            invited.expires_at,
            1_757_000_000_000 + INVITATION_LIFETIME_MS
        );

        // the link carries the organization, its name, and the invitation's half; no password.
        let decoded = JoinLink::decode(&invited.join_link).expect("the link decodes");

        assert_eq!(decoded.organization_id, owner.organization_id);
        assert_eq!(decoded.organization_name, "Acme");
        assert!(!invited.join_link.contains(&invited.generated_password));

        let (invitation_id, secret) = decoded
            .invitation_secret()
            .expect("the half")
            .expect("an invitation half");

        assert_eq!(invitation_id, invited.invitation_id);

        // both halves open the payload, and it names the member row.
        let rows = store
            .invitations(&owner.verifying_key)
            .await
            .expect("the rows");
        let row = rows
            .iter()
            .find(|row| row.id == invitation_id)
            .expect("the invitation row");
        let payload: InvitationPayload = serde_json::from_slice(
            &open_invitation(&secret, &invited.generated_password, &row.sealed).expect("opens"),
        )
        .expect("a payload");

        assert_eq!(payload.member_id, invited.member_id);
        assert!(
            open_invitation(&[0_u8; 32], &invited.generated_password, &row.sealed).is_err(),
            "the password alone opened it"
        );
        assert!(
            open_invitation(&secret, "not the password", &row.sealed).is_err(),
            "the secret alone opened it"
        );

        // the member signs in with the generated password, must change it, and holds the
        // directory and the workspace the inviter held.
        let member = sign_in(
            &store,
            &joined_as(&owner, &invited.member_id, permission::MEMBER),
            &invited.generated_password,
            &slot(),
        )
        .await
        .expect("the member did not sign in");

        assert!(member.must_change_password);
        assert_eq!(member.role, permission::MEMBER);
        assert_eq!(member.permissions, 0);
        assert!(member.workspace_credentials.contains_key(&workspace_id));
        assert_eq!(
            member.workspace_credentials[&workspace_id].token,
            owner.workspace_credentials[&workspace_id].token
        );
        assert_eq!(
            member
                .organization_credential
                .lock()
                .expect("the slot")
                .as_deref(),
            owner
                .organization_credential
                .lock()
                .expect("the slot")
                .as_deref()
        );
    }

    /// **The generated password is not derived from the email or the display name**, asserted
    /// rather than merely different: two invitations with identical inputs draw different
    /// passwords, and no part of either input appears in either password.
    #[tokio::test]
    async fn the_generated_password_is_drawn_and_not_derived() {
        let directory = scratch("password");
        let (store, owner, link, _) = owned(&directory).await;
        let invite = |email: &'static str, name: &'static str| {
            let store = &store;
            let owner = &owner;
            let link = &link;

            async move {
                invite_member(
                    store,
                    owner,
                    link,
                    Invitation {
                        email,
                        display_name: name,
                        role: permission::MEMBER,
                        workspace_ids: &[],
                    },
                    test_cost(),
                    1,
                )
                .await
                .expect("the invitation failed")
                .generated_password
            }
        };

        let first = invite("olivia.owner@acme.example", "Olivia Owner").await;
        let second = invite("olivia.owner@acme.example", "Olivia Owner").await;

        assert_ne!(first, second, "the same inputs drew the same password");

        for password in [&first, &second] {
            assert_eq!(password.len(), 23, "{password}");
            assert_eq!(password.matches('-').count(), 3, "{password}");

            for fragment in ["olivia", "owner", "acme", "example"] {
                assert!(
                    !password.to_lowercase().contains(fragment),
                    "{password} carries {fragment}"
                );
            }
        }

        let alphabet = generate_password().expect("a password");

        assert!(
            alphabet
                .chars()
                .all(|c| c == '-' || "abcdefghijkmnpqrstuvwxyz23456789".contains(c)),
            "{alphabet}"
        );
    }

    /// Requirement 23: the invitation lapses and the link does not; revoking stops the link
    /// working; reissuing makes a fresh vault under a fresh password with the old one dead.
    #[tokio::test]
    async fn an_invitation_lapses_is_revocable_and_is_reissuable_while_the_link_stands() {
        let directory = scratch("lifetime");
        let (store, owner, link, workspace_id) = owned(&directory).await;
        let workspaces = vec![workspace_id.clone()];
        let issued_at = 1_757_000_000_000;

        let invited = invite_member(
            &store,
            &owner,
            &link,
            Invitation {
                email: "sami@acme.example",
                display_name: "Sami",
                role: permission::MEMBER,
                workspace_ids: &workspaces,
            },
            test_cost(),
            issued_at,
        )
        .await
        .expect("the invitation failed");

        let standing = |now: i64| {
            let store = &store;
            let owner = &owner;

            async move {
                invitations(store, owner, now)
                    .await
                    .expect("the list")
                    .into_iter()
                    .map(|invitation| invitation.standing)
                    .collect::<Vec<_>>()
            }
        };

        assert_eq!(
            standing(issued_at + 1).await,
            vec![InvitationStanding::Open]
        );
        assert_eq!(
            standing(issued_at + INVITATION_LIFETIME_MS).await,
            vec![InvitationStanding::Lapsed]
        );

        // the link still finds the organization by name, whatever the invitation's standing.
        let decoded = JoinLink::decode(&invited.join_link).expect("the link decodes");

        assert_eq!(decoded.organization_name, "Acme");

        // revoked: the row is gone, and the link's half names nothing.
        revoke_invitation(&store, &owner, &invited.invitation_id)
            .await
            .expect("the revocation failed");

        assert!(standing(issued_at + 1).await.is_empty());
        assert!(
            revoke_invitation(&store, &owner, &invited.invitation_id)
                .await
                .is_err(),
            "a revoked invitation was revoked again"
        );

        // reissued: a fresh password opens the vault, the old one does not, and the workspace
        // the reissuer holds is re-sealed to the fresh vault.
        let reissued = reissue_invitation(
            &store,
            &owner,
            &link,
            &invited.member_id,
            test_cost(),
            issued_at + 10,
        )
        .await
        .expect("the reissue failed");

        assert_eq!(reissued.member_id, invited.member_id);
        assert_ne!(reissued.generated_password, invited.generated_password);
        assert_ne!(reissued.invitation_id, invited.invitation_id);

        let joined = joined_as(&owner, &invited.member_id, permission::MEMBER);

        assert!(
            sign_in(&store, &joined, &invited.generated_password, &slot())
                .await
                .is_err(),
            "the old password still opens the vault"
        );

        let member = sign_in(&store, &joined, &reissued.generated_password, &slot())
            .await
            .expect("the fresh password did not open the vault");

        assert!(member.workspace_credentials.contains_key(&workspace_id));
        assert_eq!(
            standing(issued_at + 11).await,
            vec![InvitationStanding::Open]
        );
    }

    /// Who may invite whom: an owner invites an administrator, who then invites a member; an
    /// administrator does not invite an administrator; a member invites nobody.
    #[tokio::test]
    async fn administration_is_what_the_row_carries_and_the_organization_key_is_the_owners() {
        let directory = scratch("roles");
        let (store, owner, link, _) = owned(&directory).await;

        let administrator = invite_member(
            &store,
            &owner,
            &link,
            Invitation {
                email: "admin@acme.example",
                display_name: "Ada Admin",
                role: permission::ADMINISTRATOR,
                workspace_ids: &[],
            },
            test_cost(),
            1,
        )
        .await
        .expect("the owner could not invite an administrator");

        // a certificate exists for them, under the organization key.
        let certificates = store.certificates().await.expect("the certificates");

        assert!(
            certificates
                .iter()
                .any(|certificate| certificate.member_id == administrator.member_id)
        );

        let ada = sign_in(
            &store,
            &joined_as(&owner, &administrator.member_id, permission::ADMINISTRATOR),
            &administrator.generated_password,
            &slot(),
        )
        .await
        .expect("the administrator did not sign in");

        assert_eq!(
            ada.permissions,
            permission::mask_of_role(permission::ADMINISTRATOR)
        );

        let mut settled = ada;
        settled.must_change_password = false;

        let member = invite_member(
            &store,
            &settled,
            &link,
            Invitation {
                email: "m@acme.example",
                display_name: "Mo",
                role: permission::MEMBER,
                workspace_ids: &[],
            },
            test_cost(),
            2,
        )
        .await
        .expect("an administrator could not invite a member");

        let refusal = invite_member(
            &store,
            &settled,
            &link,
            Invitation {
                email: "a2@acme.example",
                display_name: "Another Admin",
                role: permission::ADMINISTRATOR,
                workspace_ids: &[],
            },
            test_cost(),
            3,
        )
        .await
        .expect_err("an administrator certified an administrator");

        assert!(refusal.to_string().contains("only an owner"), "{refusal}");

        let mut mo = sign_in(
            &store,
            &joined_as(&owner, &member.member_id, permission::MEMBER),
            &member.generated_password,
            &slot(),
        )
        .await
        .expect("the member did not sign in");
        mo.must_change_password = false;

        let refusal = invite_member(
            &store,
            &mo,
            &link,
            Invitation {
                email: "x@acme.example",
                display_name: "X",
                role: permission::MEMBER,
                workspace_ids: &[],
            },
            test_cost(),
            4,
        )
        .await
        .expect_err("a member invited somebody");

        assert!(refusal.to_string().contains("inviteMember"), "{refusal}");
    }

    /// A member who must still change their password invites nobody, at the command; and an
    /// invitation into a workspace the inviter does not hold is refused by name rather than quietly
    /// granting less.
    #[tokio::test]
    async fn an_unsettled_inviter_and_an_unreachable_workspace_are_both_refused() {
        let directory = scratch("refused");
        let (store, owner, link, _) = owned(&directory).await;
        let mut unsettled = sign_in(
            &store,
            &joined_as(&owner, &owner.member_id, permission::OWNER),
            PASSWORD,
            &slot(),
        )
        .await
        .expect("the owner");
        unsettled.must_change_password = true;

        let refusal = invite_member(
            &store,
            &unsettled,
            &link,
            Invitation {
                email: "x@acme.example",
                display_name: "X",
                role: permission::MEMBER,
                workspace_ids: &[],
            },
            test_cost(),
            1,
        )
        .await
        .expect_err("an unsettled member invited");

        assert!(
            refusal.to_string().contains("change your password"),
            "{refusal}"
        );

        let elsewhere = vec!["a-workspace-nobody-here-holds".to_string()];
        let refusal = invite_member(
            &store,
            &owner,
            &link,
            Invitation {
                email: "x@acme.example",
                display_name: "X",
                role: permission::MEMBER,
                workspace_ids: &elsewhere,
            },
            test_cost(),
            1,
        )
        .await
        .expect_err("an invitation granted a workspace the inviter does not hold");

        assert!(refusal.to_string().contains("full access"), "{refusal}");
    }
}
