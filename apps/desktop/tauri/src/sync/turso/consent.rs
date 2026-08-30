//! the consent that gives this application authority over a customer's Turso account.
//!
//! One browser consent, and the customer types nothing: no Platform API token pasted, no
//! organization slug, no group name. What comes back is a Platform API token, and it is put
//! in the operating system's credential store and never anywhere else.
//!
//! **The token does not cross the IPC boundary** ([[rules/credentials]], *Client boundary*).
//! What the web layer is told is that a consent was granted and which organizations it
//! reaches, which are facts about a credential rather than the credential.
//!
//! **Nothing here is proven against the live authorization server.** The endpoints and the
//! client registration below are read off Turso's own authorization server metadata and one
//! registration request, recorded in this effort's evidence under
//! `what-turso-lets-a-desktop-client-do-alone`. Whether the authorize step honours a loopback
//! redirect, and whether the consent screen grants the scope set asked for rather than
//! presenting the whole picker, are open questions that only a human completing one consent
//! settles. Nothing here is written as though either answer were known.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[cfg(not(test))]
use keyring::{Entry as KeyringEntry, Error as KeyringError};

use serde::{Deserialize, Serialize};

use crate::{error::Error, http::build_client};

use super::super::oauth::{
    OAuthConfig,
    authorization::build_authorization_url,
    loopback::{LoopbackCallback, LoopbackWait},
    pkce::{pkce_challenge, random_url_safe_token},
    token::{OAuthTokenResponse, authorization_code_form, parse_token_response},
};

/// Where a public client registers itself, RFC 7591. Registration is open and answers with a
/// fixed `client_id` rather than minting one per caller, which is why it is repeated at every
/// consent instead of stored.
const TURSO_REGISTRATION_ENDPOINT: &str = "https://api.turso.tech/v1/oauth/register";

/// Where the person answers. Note the host: the authorization endpoint is on `app.turso.tech`
/// and the token endpoint is on `api.turso.tech`, which the metadata states and which is easy
/// to get wrong by assuming one issuer means one host.
const TURSO_AUTHORIZE_ENDPOINT: &str = "https://app.turso.tech/oauth/mcp/authorize";

const TURSO_TOKEN_ENDPOINT: &str = "https://api.turso.tech/v1/oauth/token";

/// The Platform API's base. The only call made against it here is the organizations listing,
/// which is what the consent's own answer is built from.
const TURSO_PLATFORM_API: &str = "https://api.turso.tech";

/// What this application asks a person to grant, and it is the narrowest set that does the
/// job requirement 4 states.
///
/// **Deletion is absent, deliberately.** `db:delete` would let a defect or a compromised
/// machine remove a customer's ledger, and nothing this application does needs it: a
/// workspace being deleted from the interface is a separate act and would be a separate
/// consent. `db:rotate-creds` and `group:rotate-creds` are absent for the same reason,
/// and the Platform API's own note is that rotation is destructive: it invalidates every
/// SQL credential a database has issued, which on this design would lock every member out
/// of a workspace at once.
///
/// `read` is what the organizations listing needs, which is what requirement 22 turns on.
/// `db:create` and `db:mint-token` are provisioning a workspace and handing one member a
/// credential for it, which is the whole of what this application asks a customer's account
/// to do.
///
/// **This is a request rather than a guarantee.** The authorization server metadata
/// advertises no `scopes_supported`, so whether the consent screen grants what is asked for
/// or presents the person the full picker is unknown until a consent is completed. Nothing
/// here depends on the answer.
pub(crate) const TURSO_CONSENT_SCOPES: [&str; 3] = ["read", "db:create", "db:mint-token"];

/// Where the Platform API token is filed in the platform's credential store.
///
/// A third service beside `rentable.google-drive` and `rentable.control-plane`, for the
/// reason the first of those carries in its own note: a keyring service name is data on
/// installed machines. This is a different credential from a different issuer with a
/// different lifetime, and filing it with either of the others would mean giving one up
/// could not be told from giving up the other.
///
/// **It is the reason the token is never a column.** Requirement 5 keeps this authority on
/// the owner's machine and out of every database, and a credential store is the only place
/// this application has that is not a file it wrote.
const TURSO_PLATFORM_KEYRING_SERVICE: &str = "rentable.turso-platform";

/// The one entry under that service. There is one Turso account behind an installation, and
/// the token is re-obtainable by repeating the consent, so nothing is keyed by an account
/// this application would first have to learn the name of.
const TURSO_PLATFORM_KEYRING_ACCOUNT: &str = "owner";

/// The path Turso redirects back to. It is registered with the authorization server at every
/// consent, so it is this application's to choose and Turso's to echo.
const TURSO_CONSENT_CALLBACK_PATH: &str = "/turso/callback";

/// What the registration calls this client. It is the only thing in the request a person
/// might see, and there is nothing else for it to affect.
const TURSO_CONSENT_CLIENT_NAME: &str = "Rentable";

/// Matches the timeout every other credential-path request in this crate sets. A consent
/// that hangs is a consent the person cancels.
const TURSO_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// How long a consent stays outstanding before it is treated as abandoned. Long enough to
/// find the browser window, sign in to Turso, and read the consent screen.
const TURSO_CONSENT_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// Turso's own value for a person who answered the consent screen with no. It arrives as an
/// OAuth error and is not a failure of anything.
const OAUTH_ACCESS_DENIED: &str = "access_denied";

/// The three URLs one consent is driven against, and the Platform API it then reads.
///
/// They are a value rather than four constants read at each call site so that the whole flow
/// can be pointed at a loopback server. [[rules/credentials]], under *Transport testing*, is
/// why: what breaks in this module is the serialisation and the status handling, and a mocked
/// client tests the mock's idea of HTTP rather than the request.
#[derive(Clone, Debug)]
pub struct TursoEndpoints {
    registration: String,
    authorize: String,
    token: String,
    platform: String,
}

impl TursoEndpoints {
    /// Turso's own, as its authorization server metadata advertises them.
    pub fn production() -> Self {
        Self {
            registration: TURSO_REGISTRATION_ENDPOINT.to_string(),
            authorize: TURSO_AUTHORIZE_ENDPOINT.to_string(),
            token: TURSO_TOKEN_ENDPOINT.to_string(),
            platform: TURSO_PLATFORM_API.to_string(),
        }
    }

    /// every endpoint on one loopback server, at the paths Turso publishes.
    #[cfg(test)]
    fn at(base: &str) -> Self {
        Self {
            registration: format!("{base}/v1/oauth/register"),
            authorize: format!("{base}/oauth/mcp/authorize"),
            token: format!("{base}/v1/oauth/token"),
            platform: base.to_string(),
        }
    }
}

/// A started consent. The caller opens `authorization_url` and polls `session_id`; the state
/// and the PKCE verifier behind that URL stay in this process, so there is nothing else for
/// the caller to carry and nothing it could redeem on its own.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TursoConsentStart {
    pub session_id: String,
    pub authorization_url: String,
}

/// How a consent ended.
///
/// **Failed and abandoned are two answers rather than one**, because a person closing the
/// browser tab is the ordinary case and has nothing to report, while a refusal from the
/// authorization server is something to show. Neither leaves anything in the keyring.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TursoConsentStatus {
    /// the consent screen is open and nothing has come back yet.
    #[default]
    Pending,
    /// the token is in the keyring and the organizations it reaches are known.
    Granted,
    /// the authorization server refused, or the exchange did.
    Failed,
    /// the person said no, or never answered.
    Abandoned,
}

/// one organization the consented token can reach.
///
/// **The slug rather than the name**, because the slug is what every Platform API path is
/// built from and the name is a label. `is_personal` is Turso's `type` field, which its API
/// documents as always either `personal` or `team`: a personal account is the one that ends
/// with the person, which is what requirement 22 makes the application say out loud rather
/// than leave for somebody to discover.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConsentOrganization {
    pub slug: String,
    pub is_personal: bool,
}

/// What a consent came to, and **no token**.
///
/// The organizations are what requirement 22 needs: the application provisions into an
/// organization where the account reaches one and falls back to the personal account
/// otherwise, without asking anybody to type a slug.
///
/// `error` carries the refusal where there was one. It is beyond the two fields the plan's
/// *Interfaces* names, and it is here because a status of `failed` with nothing to show is a
/// screen that can only say something went wrong.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TursoConsentResult {
    pub session_id: String,
    pub status: TursoConsentStatus,
    pub organizations: Vec<ConsentOrganization>,
    pub error: Option<String>,
}

/// What a callback turned out to carry.
#[derive(Clone, Debug, PartialEq, Eq)]
enum ConsentOutcome {
    Authorized {
        authorization_code: String,
    },
    /// the person answered the consent screen with no, or never answered at all.
    Declined,
    Failed(String),
}

/// One consent, from the authorization request to whatever settles it.
///
/// `expected_state` and `code_verifier` never leave this process: the state is what ties a
/// callback back to this session, and the verifier is what proves to Turso that the code is
/// being redeemed by whoever asked for it.
#[derive(Clone, Debug)]
struct ConsentSession {
    session_id: String,
    expected_state: String,
    code_verifier: String,
    redirect_uri: String,
    client_id: String,
    endpoints: TursoEndpoints,
    status: TursoConsentStatus,
    /// held between the callback landing and the next read redeeming it. A code is
    /// redeemable once, so it is taken as it is read.
    authorization_code: Option<String>,
    organizations: Vec<ConsentOrganization>,
    error: Option<String>,
}

impl ConsentSession {
    /// Read what a callback's query says, against the state this session issued. Pure: it
    /// decides nothing about the session's own status.
    fn read_callback(&self, query: &HashMap<String, String>) -> ConsentOutcome {
        if let Some(error) = query.get("error") {
            return if error.trim() == OAUTH_ACCESS_DENIED {
                ConsentOutcome::Declined
            } else {
                ConsentOutcome::Failed(error.clone())
            };
        }

        if query.get("state").map(String::as_str) != Some(self.expected_state.as_str()) {
            return ConsentOutcome::Failed(
                "the consent callback state did not match the session that started it".to_string(),
            );
        }

        let authorization_code = query
            .get("code")
            .map(|code| code.trim())
            .filter(|code| !code.is_empty());

        match authorization_code {
            Some(authorization_code) => ConsentOutcome::Authorized {
                authorization_code: authorization_code.to_string(),
            },
            None => ConsentOutcome::Failed(
                "the consent callback carried no authorization code".to_string(),
            ),
        }
    }

    /// Apply what a callback carried, reporting whether it was the one that settled this
    /// session. A late callback cannot revive a consent that already ended.
    ///
    /// **An authorized callback leaves the status `Pending`**, because the code is not the
    /// outcome: nothing has been granted until the token is in the keyring, and the exchange
    /// that puts it there happens on the next read.
    fn settle(&mut self, outcome: ConsentOutcome) -> bool {
        if self.status != TursoConsentStatus::Pending || self.authorization_code.is_some() {
            return false;
        }

        match outcome {
            ConsentOutcome::Authorized { authorization_code } => {
                self.authorization_code = Some(authorization_code);
            }
            ConsentOutcome::Declined => {
                self.status = TursoConsentStatus::Abandoned;
            }
            ConsentOutcome::Failed(message) => {
                self.status = TursoConsentStatus::Failed;
                self.error = Some(message);
            }
        }

        true
    }

    fn report(&self) -> TursoConsentResult {
        TursoConsentResult {
            session_id: self.session_id.clone(),
            status: self.status,
            organizations: self.organizations.clone(),
            error: self.error.clone(),
        }
    }
}

/// The consents this process has started.
///
/// Held beside the workspace's own sync state rather than inside it: a Turso consent is the
/// organization's authority and a `RemoteSync` is one workspace's replication, and the two
/// have neither a lifetime nor a credential in common.
pub struct TursoConsent {
    sessions: Arc<Mutex<HashMap<String, ConsentSession>>>,
    /// how long a consent waits for an answer. A field rather than the constant so that a
    /// test can exercise abandonment without waiting five minutes for it.
    patience: Duration,
}

impl Default for TursoConsent {
    fn default() -> Self {
        Self::new()
    }
}

impl TursoConsent {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            patience: TURSO_CONSENT_TIMEOUT,
        }
    }

    #[cfg(test)]
    fn with_patience(patience: Duration) -> Self {
        Self {
            patience,
            ..Self::new()
        }
    }

    /// Start one consent: claim the loopback port, register the client on it, and compose the
    /// URL a browser is sent to.
    ///
    /// **The port is claimed before the client is registered**, because the registration
    /// carries the redirect and only a bound listener knows which port that is.
    ///
    /// The browser is not opened here. The caller opens what this returns, which is how
    /// signing in with Google already works and is what keeps this callable from a test.
    pub async fn begin(&self, endpoints: TursoEndpoints) -> Result<TursoConsentStart, Error> {
        let callback = LoopbackCallback::bind(TURSO_CONSENT_CALLBACK_PATH)?;
        let redirect_uri = callback.redirect_uri().to_string();
        let client_id = register_client(&endpoints, &redirect_uri).await?;

        let expected_state = random_url_safe_token()?;
        let code_verifier = random_url_safe_token()?;
        let authorization_url = build_authorization_url(
            &consent_oauth_config(&endpoints),
            &client_id,
            &redirect_uri,
            &expected_state,
            &pkce_challenge(&code_verifier),
            // **none, and that is the whole of what Turso asks for on top of the two RFCs.**
            // Google's three parameters are Google's, and sending them here would be one
            // provider's vocabulary at another provider's endpoint.
            &[],
        )?;

        let session_id = format!("turso-consent-{}", random_url_safe_token()?);

        {
            let mut sessions = self.sessions.lock().map_err(|_| consents_poisoned())?;

            sessions.insert(
                session_id.clone(),
                ConsentSession {
                    session_id: session_id.clone(),
                    expected_state,
                    code_verifier,
                    redirect_uri,
                    client_id,
                    endpoints,
                    status: TursoConsentStatus::Pending,
                    authorization_code: None,
                    organizations: Vec::new(),
                    error: None,
                },
            );
        }

        let sessions = self.sessions.clone();
        let session_id_for_thread = session_id.clone();
        let patience = self.patience;

        std::thread::spawn(move || {
            let Err(error) = handle_consent_callback(
                callback,
                sessions.clone(),
                &session_id_for_thread,
                patience,
            ) else {
                return;
            };

            if let Ok(mut sessions) = sessions.lock()
                && let Some(session) = sessions.get_mut(&session_id_for_thread)
            {
                session.settle(ConsentOutcome::Failed(error.to_string()));
            }
        });

        Ok(TursoConsentStart {
            session_id,
            authorization_url,
        })
    }

    /// How far one consent has got, and where it is granted, which organizations it reaches.
    ///
    /// **This is where the code is redeemed**, so the caller never sees one. The read that
    /// finds a code exchanges it, asks Turso which organizations the token reaches, and only
    /// then files the token.
    ///
    /// **The order is the criterion.** A consent that fails leaves nothing in the credential
    /// store, and the way that is true is that nothing is written until everything has
    /// succeeded, rather than by writing early and cleaning up after a failure that may be
    /// the process going away.
    pub async fn result(&self, session_id: &str) -> Result<TursoConsentResult, Error> {
        let session_id = session_id.trim().to_string();

        // the sessions map is a std mutex, so nothing may be awaited while it is held.
        // Everything the exchange needs is copied out first.
        let redemption = {
            let mut sessions = self.sessions.lock().map_err(|_| consents_poisoned())?;
            let session = sessions
                .get_mut(&session_id)
                .ok_or_else(consent_not_found)?;

            match session.authorization_code.take() {
                Some(authorization_code) if session.status == TursoConsentStatus::Pending => (
                    authorization_code,
                    session.code_verifier.clone(),
                    session.redirect_uri.clone(),
                    session.client_id.clone(),
                    session.endpoints.clone(),
                ),
                _ => return Ok(session.report()),
            }
        };

        let (authorization_code, code_verifier, redirect_uri, client_id, endpoints) = redemption;
        let granted = redeem_consent(
            &endpoints,
            &client_id,
            &redirect_uri,
            &code_verifier,
            &authorization_code,
        )
        .await
        .and_then(|(access_token, organizations)| {
            store_platform_token(&access_token)?;

            Ok(organizations)
        });

        let mut sessions = self.sessions.lock().map_err(|_| consents_poisoned())?;
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(consent_not_found)?;

        match granted {
            Ok(organizations) => {
                session.status = TursoConsentStatus::Granted;
                session.organizations = organizations;
                session.error = None;
            }
            Err(error) => {
                session.status = TursoConsentStatus::Failed;
                session.error = Some(error.to_string());
            }
        }

        Ok(session.report())
    }
}

/// How Turso's authorization server is reached, as the neutral core wants it.
///
/// No client secret, and there is none to have: the metadata answers
/// `token_endpoint_auth_methods_supported: ["none"]`, which is a public client with PKCE, the
/// shape RFC 8252 prescribes for a native application. A secret shipped inside a desktop
/// binary would not be one.
fn consent_oauth_config(endpoints: &TursoEndpoints) -> OAuthConfig {
    OAuthConfig {
        client_id: None,
        client_secret: None,
        authorize_endpoint: endpoints.authorize.clone(),
        token_endpoint: endpoints.token.clone(),
        scopes: TURSO_CONSENT_SCOPES
            .iter()
            .map(|scope| (*scope).to_string())
            .collect(),
    }
}

/// what a dynamic client registration sends, RFC 7591.
#[derive(Debug, Serialize)]
struct ClientRegistration<'a> {
    client_name: &'a str,
    redirect_uris: [&'a str; 1],
    grant_types: [&'a str; 1],
    response_types: [&'a str; 1],
    token_endpoint_auth_method: &'a str,
}

/// what it answers with. Every field optional, because a body that is not the documented
/// shape still has a status and the status is what says what happened.
#[derive(Debug, Default, Deserialize)]
struct RegisteredClient {
    #[serde(default)]
    client_id: Option<String>,
}

/// Register this application as a public client on the loopback redirect it just claimed.
///
/// **Repeated at every consent rather than stored**, because Turso answers with the same
/// `client_id` for everybody rather than minting one per caller. Storing it would be caching
/// a constant and would go stale the day that stops being true.
///
/// This creates nothing on anybody's account: it registers an OAuth client, and it is the one
/// call in this flow that needs no credential.
async fn register_client(endpoints: &TursoEndpoints, redirect_uri: &str) -> Result<String, Error> {
    let client = build_client(TURSO_REQUEST_TIMEOUT)?;
    let response = client
        .post(&endpoints.registration)
        .json(&ClientRegistration {
            client_name: TURSO_CONSENT_CLIENT_NAME,
            redirect_uris: [redirect_uri],
            grant_types: ["authorization_code"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
        })
        .send()
        .await
        .map_err(|error| Error::Network {
            message: format!("could not reach turso to register this client: {error}"),
        })?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|error| Error::Network {
        message: format!("turso's registration answer did not arrive in full: {error}"),
    })?;
    let payload = serde_json::from_str::<RegisteredClient>(&body).unwrap_or_default();
    let client_id = payload
        .client_id
        .as_deref()
        .map(str::trim)
        .filter(|client_id| !client_id.is_empty());

    client_id.map(str::to_string).ok_or_else(|| Error::Network {
        message: format!("turso registered no client for this consent ({status})"),
    })
}

/// Redeem the code, then ask what the token reaches.
///
/// The token is returned rather than filed here, so that its one caller decides when it is
/// safe to keep. Nothing has been granted until both halves have worked.
async fn redeem_consent(
    endpoints: &TursoEndpoints,
    client_id: &str,
    redirect_uri: &str,
    code_verifier: &str,
    authorization_code: &str,
) -> Result<(String, Vec<ConsentOrganization>), Error> {
    let form = authorization_code_form(
        client_id,
        // a public client, so there is no secret to send and an empty one is a rejected
        // request rather than an ignored field.
        None,
        redirect_uri,
        code_verifier,
        authorization_code,
    );
    let platform_token = request_platform_token(&endpoints.token, &form).await?;
    let organizations = list_organizations(endpoints, &platform_token).await?;

    Ok((platform_token, organizations))
}

/// Send a prepared grant to Turso's token endpoint and read what came back.
///
/// Deliberately thin, for the reason the Google exchange next door is: everything decidable
/// is decided in `parse_token_response`, which both providers share.
async fn request_platform_token(
    token_endpoint: &str,
    form: &[(String, String)],
) -> Result<String, Error> {
    let client = build_client(TURSO_REQUEST_TIMEOUT)?;
    let response = client
        .post(token_endpoint)
        .form(form)
        .send()
        .await
        .map_err(|error| Error::Network {
            message: format!("could not reach turso's token endpoint: {error}"),
        })?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|error| Error::Network {
        message: format!("turso's token answer did not arrive in full: {error}"),
    })?;

    // a body that is not the documented envelope, a proxy's error page say, still carries its
    // status, and the status is what says what happened. Parsing it as an empty envelope
    // keeps that answer.
    let payload = serde_json::from_str::<OAuthTokenResponse>(&body).unwrap_or_default();

    parse_token_response(status, payload, crate::timestamp::now()).map(|tokens| tokens.access_token)
}

/// one organization as Turso reports it.
#[derive(Debug, Default, Deserialize)]
struct OrganizationRecord {
    #[serde(default)]
    slug: String,
    /// Turso's own field name. Its API documents this as always either `personal` or `team`.
    #[serde(default, rename = "type")]
    account_type: String,
}

/// the listing, read both ways it could arrive.
///
/// **Turso's OpenAPI schema says a bare array, and no live answer has been read.** The
/// wrapped form is accepted as well because every other Platform API answer this repository
/// has met is an object with one key, and because [[references/turso]] records that Turso's
/// field names are Go struct names showing through rather than what a JSON API usually looks
/// like. Ticket 04 is where a real answer is seen; whichever it turns out to be, this reads
/// it rather than failing in a way that would read as a defect in the consent.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum OrganizationsPayload {
    Bare(Vec<OrganizationRecord>),
    Wrapped {
        organizations: Vec<OrganizationRecord>,
    },
}

/// Ask which organizations the consented token reaches.
///
/// **This is the consent's own answer rather than the Platform API client**, which is
/// `platform.rs`'s and does not exist yet. The listing is here because the consent result is
/// what it is for: an application that learns nothing about what it was granted cannot
/// provision into an organization without asking somebody to type a slug.
async fn list_organizations(
    endpoints: &TursoEndpoints,
    platform_token: &str,
) -> Result<Vec<ConsentOrganization>, Error> {
    let client = build_client(TURSO_REQUEST_TIMEOUT)?;
    let response = client
        .get(format!("{}/v1/organizations", endpoints.platform))
        .bearer_auth(platform_token)
        .send()
        .await
        .map_err(|error| Error::Network {
            message: format!("could not ask turso which organizations this reaches: {error}"),
        })?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|error| Error::Network {
        message: format!("turso's organizations answer did not arrive in full: {error}"),
    })?;

    if !(200..300).contains(&status) {
        return Err(Error::Network {
            message: format!("turso refused to list its organizations ({status})"),
        });
    }

    Ok(read_organizations(&body))
}

/// Read a listing into what the web layer is told.
///
/// Separate from the request so the shape can be tested without one, and because this is
/// where the personal account is told from an organization, which is the fact requirement 22
/// rests on.
fn read_organizations(body: &str) -> Vec<ConsentOrganization> {
    let records = match serde_json::from_str::<OrganizationsPayload>(body) {
        Ok(OrganizationsPayload::Bare(records)) => records,
        Ok(OrganizationsPayload::Wrapped { organizations }) => organizations,
        Err(_) => Vec::new(),
    };

    records
        .into_iter()
        .filter(|record| !record.slug.trim().is_empty())
        .map(|record| ConsentOrganization {
            is_personal: record.account_type.trim().eq_ignore_ascii_case("personal"),
            slug: record.slug.trim().to_string(),
        })
        .collect()
}

/// Wait for the browser to come back, and settle the consent with what it carried.
fn handle_consent_callback(
    callback: LoopbackCallback,
    consents: Arc<Mutex<HashMap<String, ConsentSession>>>,
    session_id: &str,
    patience: Duration,
) -> Result<(), Error> {
    let started_at = Instant::now();
    let mut ran_out_of_patience = false;

    let waited = callback.accept(|| {
        let status = {
            let consents = consents.lock().map_err(|_| consents_poisoned())?;

            consents.get(session_id).map(|session| session.status)
        };

        match status {
            Some(TursoConsentStatus::Pending) => {
                if started_at.elapsed() >= patience {
                    ran_out_of_patience = true;

                    return Ok(LoopbackWait::Abandon);
                }

                // the listener paces the wait itself, so this only says whether it goes on.
                Ok(LoopbackWait::Continue)
            }
            // the consent ended some other way, or the session is gone. Either way nothing
            // is waiting for this port any more.
            Some(_) | None => Ok(LoopbackWait::Abandon),
        }
    })?;

    let Some(request) = waited else {
        if ran_out_of_patience
            && let Ok(mut consents) = consents.lock()
            && let Some(session) = consents.get_mut(session_id)
        {
            // **nobody answered, which is the common case rather than the exceptional one.**
            // A person who closes the tab has not failed at anything, and this is the half of
            // criterion 5 that says which of the two it was.
            session.settle(ConsentOutcome::Declined);
        }

        return Ok(());
    };

    let page = {
        let mut consents = consents.lock().map_err(|_| consents_poisoned())?;
        let session = consents.get_mut(session_id).ok_or_else(consent_not_found)?;
        let outcome = session.read_callback(request.query());
        let proposed = callback_page_message(&outcome);

        if session.settle(outcome) {
            proposed
        } else {
            // the consent ended between this connection being accepted and the outcome being
            // applied. The page states what holds rather than what this callback proposed.
            "This consent already finished in the app. You can close this window.".to_string()
        }
    };

    request.respond(&page)
}

/// What the browser tab is left showing.
fn callback_page_message(outcome: &ConsentOutcome) -> String {
    match outcome {
        ConsentOutcome::Authorized { .. } => {
            "Rentable now has access to your Turso account. You can close this window.".to_string()
        }
        ConsentOutcome::Declined => {
            "Rentable was not given access to your Turso account. You can close this window."
                .to_string()
        }
        ConsentOutcome::Failed(message) => {
            format!("Connecting your Turso account failed: {message}. You can close this window.")
        }
    }
}

#[cfg(not(test))]
fn store_platform_token(platform_token: &str) -> Result<(), Error> {
    platform_keyring_entry()?
        .set_password(platform_token)
        .map_err(|error| format_keyring_error("store", error))
}

#[cfg(not(test))]
fn platform_keyring_entry() -> Result<KeyringEntry, Error> {
    KeyringEntry::new(
        TURSO_PLATFORM_KEYRING_SERVICE,
        TURSO_PLATFORM_KEYRING_ACCOUNT,
    )
    .map_err(|error| format_keyring_error("open", error))
}

/// **The token itself never reaches this message.** A credential in an error string is a
/// credential in whatever reads that string, and every error here crosses to the web layer.
#[cfg(not(test))]
fn format_keyring_error(action: &str, error: KeyringError) -> Error {
    Error::Credential {
        message: format!("failed to {action} the turso platform token: {error}"),
    }
}

/// the credential store a test has. It stands in for exactly the two calls above, so a test
/// asserts on where the token went rather than on a mocked keyring's idea of it.
#[cfg(test)]
fn store_platform_token(platform_token: &str) -> Result<(), Error> {
    let mut stored = test_platform_token()
        .lock()
        .map_err(|_| consents_poisoned())?;

    *stored = Some(platform_token.to_string());

    Ok(())
}

#[cfg(test)]
fn test_platform_token() -> &'static Mutex<Option<String>> {
    use std::sync::OnceLock;

    static STORE: OnceLock<Mutex<Option<String>>> = OnceLock::new();

    STORE.get_or_init(|| Mutex::new(None))
}

/// the consents map is only ever held for a field read or write, so a poisoned lock means a
/// panic elsewhere rather than anything the caller did.
fn consents_poisoned() -> Error {
    Error::Internal {
        message: "failed to lock the turso consents".to_string(),
    }
}

fn consent_not_found() -> Error {
    Error::NotFound {
        message: "turso consent not found".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, path::Path, time::Duration};

    use serde_json::json;

    use crate::sync::google::test::server::{ScriptedResponse, ScriptedServer};

    use super::{
        ConsentOrganization, TURSO_CONSENT_SCOPES, TURSO_PLATFORM_KEYRING_ACCOUNT,
        TURSO_PLATFORM_KEYRING_SERVICE, TursoConsent, TursoConsentStatus, TursoEndpoints,
        read_organizations, test_platform_token,
    };

    const ACCESS_TOKEN: &str = "the-platform-api-token";

    fn forget_the_stored_token() {
        *test_platform_token()
            .lock()
            .expect("the test credential store was poisoned") = None;
    }

    fn stored_token() -> Option<String> {
        test_platform_token()
            .lock()
            .expect("the test credential store was poisoned")
            .clone()
    }

    fn registration_answer() -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({
                "client_id": "turso-mcp",
                "token_endpoint_auth_method": "none",
            })
            .to_string(),
        )
    }

    fn token_answer() -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({ "access_token": ACCESS_TOKEN, "expires_in": 3600 }).to_string(),
        )
    }

    fn organizations_answer() -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!([
                { "name": "personal", "slug": "saud-alnasser", "type": "personal" },
                { "name": "Acme", "slug": "acme", "type": "team" },
            ])
            .to_string(),
        )
    }

    /// what the query of an authorization url said.
    fn authorization_parameters(url: &str) -> HashMap<String, String> {
        url::Url::parse(url)
            .expect("the authorization url did not parse")
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect()
    }

    /// arrive on the loopback redirect the way a browser would, carrying what Turso would
    /// have put on it.
    async fn arrive_at_the_callback(authorization_url: &str, pairs: &[(&str, &str)]) {
        let parameters = authorization_parameters(authorization_url);
        let redirect_uri = parameters
            .get("redirect_uri")
            .expect("the authorization url carried no redirect")
            .clone();
        let mut callback = url::Url::parse(&redirect_uri).expect("the redirect did not parse");

        {
            let mut query = callback.query_pairs_mut();

            for (name, value) in pairs {
                let value = if *name == "state" && value.is_empty() {
                    parameters
                        .get("state")
                        .expect("the authorization url carried no state")
                        .clone()
                } else {
                    (*value).to_string()
                };

                query.append_pair(name, &value);
            }
        }

        let client = crate::http::build_client(Duration::from_secs(5))
            .expect("failed to build a client for the callback");

        client
            .get(callback.as_str())
            .send()
            .await
            .expect("the loopback callback refused the browser");
    }

    /// poll the way the interface does, until the consent stops being pending.
    async fn settled(consent: &TursoConsent, session_id: &str) -> super::TursoConsentResult {
        for _ in 0..200 {
            let result = consent
                .result(session_id)
                .await
                .expect("failed to read the consent");

            if result.status != TursoConsentStatus::Pending {
                return result;
            }

            tokio::time::sleep(Duration::from_millis(25)).await;
        }

        panic!("the consent never stopped being pending");
    }

    /// **This test is what makes criterion 4 checkable at all.** The consent screen is the
    /// person's and cannot be asserted from here, so what is pinned is the request: the exact
    /// set, by value, rather than that it is non-empty.
    ///
    /// Deletion is the one that matters. `db:delete` would let a defect remove a customer's
    /// ledger, and an added scope is invisible on a screen nobody reads twice.
    #[test]
    fn the_consent_asks_for_creating_databases_and_minting_their_credentials() {
        assert_eq!(TURSO_CONSENT_SCOPES, ["read", "db:create", "db:mint-token"]);
    }

    /// the set above stated as the property behind it, so that a later edit has to argue with
    /// the reason rather than with a list.
    #[test]
    fn the_consent_asks_for_no_authority_to_destroy_anything() {
        for scope in TURSO_CONSENT_SCOPES {
            assert!(
                !scope.contains("delete"),
                "a deleting scope reached the consent: {scope}"
            );
            assert!(
                !scope.contains("rotate"),
                "a rotating scope reached the consent, which invalidates every credential a database has issued: {scope}"
            );
            assert_ne!(
                scope, "full-access",
                "the consent asked for everything rather than for what it needs"
            );
        }
    }

    #[tokio::test]
    async fn the_registration_asks_turso_for_a_public_client_on_the_loopback_redirect() {
        let server = ScriptedServer::start(vec![registration_answer()]).await;
        let consent = TursoConsent::new();
        let started = consent
            .begin(TursoEndpoints::at(&server.url("")))
            .await
            .expect("failed to begin the consent");
        let request = server.request(0);
        let body = serde_json::from_str::<serde_json::Value>(&request.body)
            .expect("the registration body was not json");
        let parameters = authorization_parameters(&started.authorization_url);
        let redirect_uri = parameters
            .get("redirect_uri")
            .expect("the authorization url carried no redirect");

        assert_eq!(request.method, "POST");
        assert_eq!(request.target, "/v1/oauth/register");
        assert_eq!(body["token_endpoint_auth_method"], "none");
        assert_eq!(body["grant_types"], json!(["authorization_code"]));
        assert_eq!(body["response_types"], json!(["code"]));
        assert_eq!(body["redirect_uris"], json!([redirect_uri]));
    }

    /// the scope set and the loopback redirect as they actually reach the wire, rather than
    /// as the builder was asked for them.
    #[tokio::test]
    async fn the_authorization_url_carries_the_scope_set_and_the_loopback_redirect() {
        let server = ScriptedServer::start(vec![registration_answer()]).await;
        let consent = TursoConsent::new();
        let started = consent
            .begin(TursoEndpoints::at(&server.url("")))
            .await
            .expect("failed to begin the consent");
        let parsed = url::Url::parse(&started.authorization_url)
            .expect("the authorization url did not parse");
        let parameters = authorization_parameters(&started.authorization_url);
        let redirect_uri = parameters
            .get("redirect_uri")
            .expect("the authorization url carried no redirect");

        assert_eq!(parsed.path(), "/oauth/mcp/authorize");
        assert_eq!(
            parameters.get("scope").map(String::as_str),
            Some("read db:create db:mint-token")
        );
        assert_eq!(
            parameters.get("client_id").map(String::as_str),
            Some("turso-mcp")
        );
        assert_eq!(
            parameters.get("response_type").map(String::as_str),
            Some("code")
        );
        assert_eq!(
            parameters.get("code_challenge_method").map(String::as_str),
            Some("S256")
        );
        assert!(
            parameters
                .get("code_challenge")
                .is_some_and(|challenge| challenge.len() == 43),
            "the authorization url carried no s256 challenge: {parameters:?}"
        );
        assert!(
            redirect_uri.starts_with("http://127.0.0.1:"),
            "the redirect was not a loopback address: {redirect_uri}"
        );
        assert!(
            redirect_uri.ends_with("/turso/callback"),
            "the redirect was not the callback path: {redirect_uri}"
        );
        assert!(
            !started.authorization_url.contains("access_type"),
            "google's own parameters reached turso: {}",
            started.authorization_url
        );
    }

    /// the whole flow on the wire: register, arrive on the loopback redirect, exchange, and
    /// ask what the token reaches.
    #[tokio::test]
    async fn a_granted_consent_exchanges_the_code_and_reports_the_organizations_it_reaches() {
        forget_the_stored_token();

        let server = ScriptedServer::start(vec![
            registration_answer(),
            token_answer(),
            organizations_answer(),
        ])
        .await;
        let consent = TursoConsent::new();
        let started = consent
            .begin(TursoEndpoints::at(&server.url("")))
            .await
            .expect("failed to begin the consent");

        arrive_at_the_callback(
            &started.authorization_url,
            &[("code", "the-authorization-code"), ("state", "")],
        )
        .await;

        let result = settled(&consent, &started.session_id).await;
        let exchange = server.request(1);
        let exchanged = url::form_urlencoded::parse(exchange.body.as_bytes())
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect::<HashMap<_, _>>();
        let listing = server.request(2);
        let parameters = authorization_parameters(&started.authorization_url);

        assert_eq!(result.status, TursoConsentStatus::Granted);
        assert_eq!(
            result.organizations,
            vec![
                ConsentOrganization {
                    slug: "saud-alnasser".to_string(),
                    is_personal: true,
                },
                ConsentOrganization {
                    slug: "acme".to_string(),
                    is_personal: false,
                },
            ]
        );

        assert_eq!(exchange.target, "/v1/oauth/token");
        assert_eq!(
            exchanged.get("grant_type").map(String::as_str),
            Some("authorization_code")
        );
        assert_eq!(
            exchanged.get("code").map(String::as_str),
            Some("the-authorization-code")
        );
        assert_eq!(
            exchanged.get("redirect_uri"),
            parameters.get("redirect_uri"),
            "the exchange replayed a different redirect than the authorization asked for"
        );
        assert!(
            exchanged.contains_key("code_verifier"),
            "the exchange sent no pkce verifier: {exchanged:?}"
        );
        assert!(
            !exchanged.contains_key("client_secret"),
            "a public client sent a secret it does not have: {exchanged:?}"
        );

        assert_eq!(listing.method, "GET");
        assert_eq!(listing.target, "/v1/organizations");
        assert_eq!(
            listing.header("authorization"),
            Some(format!("Bearer {ACCESS_TOKEN}").as_str())
        );
    }

    /// **the whole of the client boundary, at the one place the token exists.**
    #[tokio::test]
    async fn the_platform_token_reaches_the_keyring_and_nothing_the_caller_can_read() {
        forget_the_stored_token();

        let server = ScriptedServer::start(vec![
            registration_answer(),
            token_answer(),
            organizations_answer(),
        ])
        .await;
        let consent = TursoConsent::new();
        let started = consent
            .begin(TursoEndpoints::at(&server.url("")))
            .await
            .expect("failed to begin the consent");

        arrive_at_the_callback(
            &started.authorization_url,
            &[("code", "the-authorization-code"), ("state", "")],
        )
        .await;

        let result = settled(&consent, &started.session_id).await;
        let crossing = serde_json::to_string(&result).expect("the result would not serialize");

        assert_eq!(stored_token().as_deref(), Some(ACCESS_TOKEN));
        assert!(
            !crossing.contains(ACCESS_TOKEN),
            "the platform token crossed to the web layer: {crossing}"
        );
        assert!(
            !crossing.contains("accessToken") && !crossing.contains("access_token"),
            "the result grew a field for a token: {crossing}"
        );
        assert!(
            std::env::vars().all(|(_, value)| value != ACCESS_TOKEN),
            "the platform token reached an environment variable"
        );
    }

    /// **not a file, not a column, not a log line**, checked where a later change would put
    /// one: anywhere in this crate that is not the credential store this module owns.
    ///
    /// It reads the source rather than the behaviour on purpose. A schema that grew a column
    /// for the token, or a diagnostic that logged it, would pass every other test here.
    #[test]
    fn nothing_but_this_module_names_the_platform_token_service() {
        let crate_root = Path::new(env!("CARGO_MANIFEST_DIR"));
        let mut named = Vec::new();

        visit(&crate_root.join("src"), &mut |path, source| {
            if source.contains(TURSO_PLATFORM_KEYRING_SERVICE) {
                named.push(
                    path.strip_prefix(crate_root)
                        .unwrap_or(path)
                        .to_string_lossy()
                        .replace('\\', "/"),
                );
            }
        });

        assert_eq!(
            named,
            vec!["src/sync/turso/consent.rs".to_string()],
            "the platform token's keyring service is named outside the module that owns it"
        );
        assert_eq!(TURSO_PLATFORM_KEYRING_SERVICE, "rentable.turso-platform");
        assert_eq!(TURSO_PLATFORM_KEYRING_ACCOUNT, "owner");
    }

    /// the other half of the same criterion: this module writes the token nowhere a reader
    /// could reach it, so there is no diagnostic and no print in it at all.
    #[test]
    fn the_consent_writes_no_log_line_that_could_carry_the_token() {
        let source = include_str!("consent.rs");

        // built rather than written out, because a needle spelled in full would be found in
        // the line that spells it and this test would pass by describing itself.
        for writer in ["diagnostics", "println", "eprintln", "dbg"] {
            let needle = format!(
                "{writer}{}",
                if writer == "diagnostics" { "::" } else { "!" }
            );

            assert!(
                !source.contains(&needle),
                "the consent module reached for {needle}, which is a second home for the token"
            );
        }
    }

    /// **a person who says no has not failed at anything**, and the two answers are what
    /// criterion 5 asks the consent to tell apart.
    #[tokio::test]
    async fn a_declined_consent_is_abandoned_and_leaves_the_keyring_empty() {
        forget_the_stored_token();

        let server = ScriptedServer::start(vec![registration_answer()]).await;
        let consent = TursoConsent::new();
        let started = consent
            .begin(TursoEndpoints::at(&server.url("")))
            .await
            .expect("failed to begin the consent");

        arrive_at_the_callback(&started.authorization_url, &[("error", "access_denied")]).await;

        let result = settled(&consent, &started.session_id).await;

        assert_eq!(result.status, TursoConsentStatus::Abandoned);
        assert_eq!(stored_token(), None);
        assert!(result.organizations.is_empty());
    }

    #[tokio::test]
    async fn a_refused_consent_fails_and_leaves_the_keyring_empty() {
        forget_the_stored_token();

        let server = ScriptedServer::start(vec![registration_answer()]).await;
        let consent = TursoConsent::new();
        let started = consent
            .begin(TursoEndpoints::at(&server.url("")))
            .await
            .expect("failed to begin the consent");

        arrive_at_the_callback(&started.authorization_url, &[("error", "invalid_scope")]).await;

        let result = settled(&consent, &started.session_id).await;

        assert_eq!(result.status, TursoConsentStatus::Failed);
        assert_eq!(stored_token(), None);
        assert_eq!(result.error.as_deref(), Some("invalid_scope"));
    }

    /// **a browser tab that is closed is the common case**, and nothing ever arrives on the
    /// loopback port. The patience is a field so that this is a test rather than a five
    /// minute wait.
    #[tokio::test]
    async fn a_consent_nobody_answers_is_abandoned_when_the_patience_runs_out() {
        forget_the_stored_token();

        let server = ScriptedServer::start(vec![registration_answer()]).await;
        let consent = TursoConsent::with_patience(Duration::from_millis(150));
        let started = consent
            .begin(TursoEndpoints::at(&server.url("")))
            .await
            .expect("failed to begin the consent");

        let result = settled(&consent, &started.session_id).await;

        assert_eq!(result.status, TursoConsentStatus::Abandoned);
        assert_eq!(stored_token(), None);
    }

    /// a callback carrying somebody else's state is not this consent's, and a code redeemed
    /// off one would be a code this application did not ask for.
    #[tokio::test]
    async fn a_callback_whose_state_does_not_match_fails_without_redeeming_anything() {
        forget_the_stored_token();

        let server = ScriptedServer::start(vec![registration_answer()]).await;
        let consent = TursoConsent::new();
        let started = consent
            .begin(TursoEndpoints::at(&server.url("")))
            .await
            .expect("failed to begin the consent");

        arrive_at_the_callback(
            &started.authorization_url,
            &[("code", "somebody-elses-code"), ("state", "not-the-state")],
        )
        .await;

        let result = settled(&consent, &started.session_id).await;

        assert_eq!(result.status, TursoConsentStatus::Failed);
        assert_eq!(stored_token(), None);
        assert_eq!(server.request_count(), 1, "a mismatched state was redeemed");
    }

    /// the exchange itself refusing is the other way a consent fails after the person has
    /// already answered, and it must leave the credential store exactly as it found it.
    #[tokio::test]
    async fn a_refused_exchange_leaves_nothing_in_the_keyring() {
        forget_the_stored_token();

        let server = ScriptedServer::start(vec![
            registration_answer(),
            ScriptedResponse::new(
                400,
                json!({
                    "error": "invalid_grant",
                    "error_description": "the code was already redeemed",
                })
                .to_string(),
            ),
        ])
        .await;
        let consent = TursoConsent::new();
        let started = consent
            .begin(TursoEndpoints::at(&server.url("")))
            .await
            .expect("failed to begin the consent");

        arrive_at_the_callback(
            &started.authorization_url,
            &[("code", "the-authorization-code"), ("state", "")],
        )
        .await;

        let result = settled(&consent, &started.session_id).await;

        assert_eq!(result.status, TursoConsentStatus::Failed);
        assert_eq!(stored_token(), None);
        assert!(
            result
                .error
                .as_deref()
                .is_some_and(|error| error.contains("the code was already redeemed")),
            "turso's own refusal was dropped: {:?}",
            result.error
        );
    }

    /// a listing that never arrives means the token was granted and nothing is known about
    /// what it reaches, which is not a consent this application can act on. Nothing is filed.
    #[tokio::test]
    async fn a_listing_that_is_refused_leaves_nothing_in_the_keyring() {
        forget_the_stored_token();

        let server = ScriptedServer::start(vec![
            registration_answer(),
            token_answer(),
            ScriptedResponse::new(401, "{}"),
        ])
        .await;
        let consent = TursoConsent::new();
        let started = consent
            .begin(TursoEndpoints::at(&server.url("")))
            .await
            .expect("failed to begin the consent");

        arrive_at_the_callback(
            &started.authorization_url,
            &[("code", "the-authorization-code"), ("state", "")],
        )
        .await;

        let result = settled(&consent, &started.session_id).await;

        assert_eq!(result.status, TursoConsentStatus::Failed);
        assert_eq!(stored_token(), None);
    }

    /// **which answer requirement 22 gets**, read off the field Turso's API documents for it.
    #[test]
    fn a_personal_account_is_told_apart_by_the_type_turso_reports() {
        let organizations = read_organizations(
            &json!([
                { "slug": "a-person", "type": "personal" },
                { "slug": "a-company", "type": "team" },
            ])
            .to_string(),
        );

        assert_eq!(
            organizations,
            vec![
                ConsentOrganization {
                    slug: "a-person".to_string(),
                    is_personal: true,
                },
                ConsentOrganization {
                    slug: "a-company".to_string(),
                    is_personal: false,
                },
            ]
        );
    }

    /// an account that reaches no organization at all is requirement 22's other answer, and
    /// it is an empty listing rather than a failure.
    #[test]
    fn an_account_that_reaches_nothing_reports_nothing() {
        assert!(read_organizations("[]").is_empty());
        assert!(read_organizations("{\"organizations\": []}").is_empty());
    }

    /// no live answer has been read, so the listing is accepted either way it could arrive.
    #[test]
    fn a_listing_is_read_whether_or_not_it_is_wrapped() {
        let wrapped = read_organizations(
            &json!({ "organizations": [{ "slug": "a-company", "type": "team" }] }).to_string(),
        );

        assert_eq!(
            wrapped,
            vec![ConsentOrganization {
                slug: "a-company".to_string(),
                is_personal: false,
            }]
        );
    }

    /// every `.rs` file under `root`, for the source-level assertion above.
    fn visit(root: &Path, seen: &mut impl FnMut(&Path, &str)) {
        let Ok(entries) = std::fs::read_dir(root) else {
            return;
        };

        for entry in entries.flatten() {
            let path = entry.path();

            if path.is_dir() {
                visit(&path, seen);
            } else if path.extension().is_some_and(|extension| extension == "rs")
                && let Ok(source) = std::fs::read_to_string(&path)
            {
                seen(&path, &source);
            }
        }
    }
}
