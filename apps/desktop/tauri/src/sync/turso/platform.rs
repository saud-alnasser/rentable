//! Turso's Platform API, as this application uses it.
//!
//! **A port, not a client**, which is `apps/control-plane/src/workspace/turso.ts` carried into
//! Rust with its shape intact. Everything above this module reaches Turso through
//! [`TursoPlatform`], so a caller is tested against [`InMemoryPlatform`] answering in memory and
//! the one place a live account is touched is where [`PlatformApi`] is constructed. What the
//! in-memory stand-in cannot confirm is the contract itself, the paths, the credential, the query
//! and the shape read back, and that is what the scripted-server tests below and the one live test
//! are for.
//!
//! **Three operations, and two things about them this port decides rather than the caller.**
//!
//! Every database this creates has delete protection turned on before the create is reported
//! done. Requirement 4 asks for it because the consent grants `db:delete` whatever was requested,
//! and the protection is the only barrier available. Turso's create call takes no such flag, so it
//! is a second request, `PATCH .../configuration`, made inside [`TursoPlatform::create_database`]
//! rather than left to a later pass: a create whose protection could not be turned on is a failed
//! create, and the database it made is removed again so that nothing unprotected is ever handed
//! back. **It is a barrier and not a guarantee.** The same grant carries `db:configure`, so
//! whoever holds it can turn the protection off again, which is exactly what
//! [`TursoPlatform::delete_database`] does on its way to deleting.
//!
//! Deletion is behind [`DeletionIntent`]. Requirement 4 permits deleting a database only while a
//! human is deleting that workspace in the interface, and a port offering deletion as freely as
//! creation would leave that unenforceable from outside. The intent is a value the caller has to
//! construct and name, so the reason is on the record at every call site and a reviewer can read
//! them all.
//!
//! **The failure vocabulary is `turso.ts`'s, with two additions.** A request that never arrived
//! or a 5xx is a moment that will pass; a 4xx is Turso refusing on purpose, and asking again will
//! not help. Added here: a refusal that belongs to the customer's account rather than to the
//! request, which requirement 25 needs to tell from a synchronisation problem, and having no
//! authority at all, which requirement 5 answers by consenting again rather than by assuming a
//! token is still there. Turso's own message names a database and sometimes an organization; it
//! goes to the diagnostics log and never into a message a person reads.
//!
//! **Nothing here lists organizations and nothing here creates a group.** The listing answers 403
//! to a group-scoped token and the application has nothing that can make a group
//! ([[efforts/819-an-organization-hosts-its-own-workspaces/evidence/prototypes/one-real-consent]]);
//! the slug and the group are handed to this port by `discovery.rs` and by the customer's own
//! preparation in Turso's dashboard.
//!
//! **One test here reaches Turso**, admitted in [[rules/testing]] under *Tests that reach a live
//! remote* as the fourth property: whether the Platform API takes what a Rust port sends. It
//! carries `#[ignore]` and panics rather than skipping when its variables are absent, for the
//! reason `discovery.rs` gives. It creates one database in the group the consent named, mints a
//! credential for it, reads the protection back, and deletes what it made. It is run at the human's
//! request and never as part of a sweep ([[references/turso]], *Never run*).
//!
//! ```text
//! RENTABLE_LIVE_TURSO=1 TURSO_CONSENT_TOKEN=… TURSO_ORG=… TURSO_GROUP=… \
//!   cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml \
//!   platform_live -- --test-threads=1 --ignored --nocapture
//! ```

use std::{future::Future, time::Duration};

use serde_json::{Value, json};

use crate::{diagnostics, error::Error, http::build_client};

use super::{consent::platform_token, discovery::TursoOrganization};

const TURSO_PLATFORM_API: &str = "https://api.turso.tech";

/// Matches the timeout every other credential-path request in this crate sets.
const PLATFORM_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// `full-access` is the only authorization this port mints today, as `turso.ts` did: the mint
/// exposes `full-access | read-only` and nothing finer. A read-only grant is requirement 11's and
/// arrives with the ticket that builds it, as a second value here rather than a second port.
const FULL_ACCESS: &str = "full-access";

/// One workspace database on the customer's account.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WorkspaceDatabase {
    /// the database's name in the organization, which is what every other call names it by.
    pub name: String,
    /// what a client syncs against, without a scheme. `libsql://` is prepended by the caller.
    pub hostname: String,
}

/// Why a database is being deleted, stated by whoever asks.
///
/// **Both variants are the two callers [[references/turso]] permits under *Never run***, and
/// nothing else is one: a database is somebody's ledger, and the only reasons to remove one are
/// that its owner is removing the workspace, now, in the interface, or that this process made it a
/// moment ago and could not finish making it a workspace, so nothing refers to it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DeletionIntent {
    /// the human is deleting this workspace in the interface, at this moment. Requirement 4.
    WorkspaceDeletedByHuman,
    /// this process created the database and what it was created for did not complete, so the
    /// database is unreferenced and would otherwise be left behind on the customer's account.
    CreatedAndUnreferenced,
}

/// How a Platform API operation failed, in the vocabulary a caller can act on.
///
/// The `what` in each is the operation as a person would name it, `create the workspace
/// database` and the like, so the message reads as a sentence about a workspace rather than about
/// the infrastructure under it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PlatformError {
    /// the request never arrived, or Turso could not serve it. Asking again is the right response.
    Unreachable { what: &'static str },
    /// Turso refused on purpose: a group that does not exist, a name already taken, a database
    /// that is delete-protected. Nothing about asking again changes the answer.
    Refused { what: &'static str },
    /// the refusal belongs to the customer's account, a quota or a bill, and not to the request.
    /// Requirement 25 tells this one from the two above.
    AccountRefused { what: &'static str },
    /// this machine holds no Turso authority, because no consent was granted or it was given up.
    /// Requirement 5: the answer is to consent again.
    NoAuthority,
}

impl PlatformError {
    fn message(&self) -> String {
        match self {
            Self::Unreachable { what } => {
                format!("could not {what} just now. try again in a moment")
            }
            Self::Refused { what } => format!("could not {what}. trying again will not help"),
            Self::AccountRefused { what } => format!(
                "could not {what}: the organization's turso account needs attention before this \
                 can continue"
            ),
            Self::NoAuthority => {
                "this machine holds no turso authority. grant the consent again to continue"
                    .to_string()
            }
        }
    }
}

impl std::fmt::Display for PlatformError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message())
    }
}

/// How each failure crosses to the web layer. `AccountRefused` crosses as a precondition for now,
/// with its message naming the account; the surface requirement 25 asks for is ticket 17's and it
/// is what gives the account its own code.
impl From<PlatformError> for Error {
    fn from(error: PlatformError) -> Self {
        let message = error.message();

        match error {
            PlatformError::Unreachable { .. } => Error::Network { message },
            PlatformError::Refused { .. } | PlatformError::AccountRefused { .. } => {
                Error::PreconditionFailed { message }
            }
            PlatformError::NoAuthority => Error::NotConfigured { message },
        }
    }
}

/// What every caller above this module reaches Turso through.
///
/// The futures are `Send` so an implementation can be driven from a Tauri command; a caller is
/// generic over the port rather than holding a trait object, which is what keeps the methods
/// `async` without a boxing crate.
pub trait TursoPlatform {
    /// Create `name` in the organization's group with delete protection on, and read its hostname
    /// back. A database that could not be protected is removed again and reported as not created.
    fn create_database(
        &self,
        name: &str,
    ) -> impl Future<Output = Result<WorkspaceDatabase, PlatformError>> + Send;

    /// A full-access token for one database, expiring after `expiration` in Turso's own duration
    /// spelling, `3d` and the like.
    fn mint_token(
        &self,
        database_name: &str,
        expiration: &str,
    ) -> impl Future<Output = Result<String, PlatformError>> + Send;

    /// Remove `name`, lifting its delete protection first. The intent is the caller's statement of
    /// why, and there is no way to call this without making one.
    fn delete_database(
        &self,
        name: &str,
        intent: DeletionIntent,
    ) -> impl Future<Output = Result<(), PlatformError>> + Send;

    /// Turn delete protection on for a database this port did not create.
    ///
    /// One caller: the first run into an empty group, where the organization's database is
    /// created through the MCP server because no slug exists yet for this port to create it with
    /// (`discovery.rs`). Everything this port creates itself is protected inside the create.
    fn protect_database(
        &self,
        name: &str,
    ) -> impl Future<Output = Result<(), PlatformError>> + Send;
}

/// A shared port is a port: a caller that is handed the platform by a factory can keep a handle on
/// the same one, which is what lets a test read back what an in-memory platform was asked.
impl<T: TursoPlatform + Sync + Send> TursoPlatform for std::sync::Arc<T> {
    async fn create_database(&self, name: &str) -> Result<WorkspaceDatabase, PlatformError> {
        (**self).create_database(name).await
    }

    async fn mint_token(
        &self,
        database_name: &str,
        expiration: &str,
    ) -> Result<String, PlatformError> {
        (**self).mint_token(database_name, expiration).await
    }

    async fn delete_database(
        &self,
        name: &str,
        intent: DeletionIntent,
    ) -> Result<(), PlatformError> {
        (**self).delete_database(name, intent).await
    }

    async fn protect_database(&self, name: &str) -> Result<(), PlatformError> {
        (**self).protect_database(name).await
    }
}

/// Where the Platform API lives. A value rather than the constant so the whole client can be pointed
/// at a loopback server, for the reason [[rules/credentials]] gives under *Transport testing*.
#[derive(Clone, Debug)]
pub struct PlatformEndpoint {
    base: String,
}

impl PlatformEndpoint {
    pub fn production() -> Self {
        Self {
            base: TURSO_PLATFORM_API.to_string(),
        }
    }

    #[cfg(test)]
    fn at(base: &str) -> Self {
        Self {
            base: base.to_string(),
        }
    }
}

/// The real thing: `turso.ts` over reqwest, against the organization and group a consent turned
/// out to be over.
///
/// **The authority is read at every call, never held.** The consent files the token in the
/// keyring and the disconnect removes it, so a client that captured the token at construction would
/// keep spending an authority the owner had given up. Reading it each time is what makes
/// requirement 5's disconnect take effect at the next request rather than at the next launch.
#[derive(Clone, Debug)]
pub struct PlatformApi {
    endpoint: PlatformEndpoint,
    organization: TursoOrganization,
}

impl PlatformApi {
    pub fn new(endpoint: PlatformEndpoint, organization: TursoOrganization) -> Self {
        Self {
            endpoint,
            organization,
        }
    }

    fn organization_url(&self) -> String {
        format!(
            "{}/v1/organizations/{}",
            self.endpoint.base, self.organization.slug
        )
    }

    fn database_url(&self, name: &str) -> String {
        format!("{}/databases/{name}", self.organization_url())
    }

    fn configuration_url(&self, name: &str) -> String {
        format!("{}/configuration", self.database_url(name))
    }

    /// The delete protection of one database, set in a request of its own because Turso's create
    /// takes no such field. Called from the create with `true` and from the delete with `false`.
    async fn set_delete_protection(
        &self,
        client: &reqwest::Client,
        platform_token: &str,
        name: &str,
        protected: bool,
        what: &'static str,
    ) -> Result<(), PlatformError> {
        call(
            what,
            client
                .patch(self.configuration_url(name))
                .bearer_auth(platform_token)
                .json(&json!({ "delete_protection": protected })),
        )
        .await
        .map(|_| ())
    }

    /// Remove a database this call just made and could not protect, so that nothing unprotected is
    /// handed back. Best effort: a refusal here is logged and the create's own failure is what the
    /// caller sees.
    async fn remove_unprotected(&self, client: &reqwest::Client, platform_token: &str, name: &str) {
        let removed = call(
            "remove the workspace database",
            client
                .delete(self.database_url(name))
                .bearer_auth(platform_token),
        )
        .await;

        if let Err(error) = removed {
            diagnostics::error("turso.platform.unprotectedDatabaseLeftBehind")
                .with("database", name)
                .with("error", error.to_string())
                .write();
        }
    }
}

impl TursoPlatform for PlatformApi {
    async fn create_database(&self, name: &str) -> Result<WorkspaceDatabase, PlatformError> {
        let what = "create the workspace database";
        let client = client()?;
        let platform_token = authority()?;

        let body = call(
            what,
            client
                .post(format!("{}/databases", self.organization_url()))
                .bearer_auth(&platform_token)
                .json(&json!({ "name": name, "group": self.organization.group })),
        )
        .await?;

        // Both spellings are read, and only one of them is documented. Turso's reference gives
        // `Hostname` with a capital, a Go struct field showing through, which is unusual enough
        // that a change to it would be a silent total failure of the one route this port exists
        // for. Accepting either costs an `or_else`.
        let hostname = body
            .pointer("/database/Hostname")
            .or_else(|| body.pointer("/database/hostname"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|hostname| !hostname.is_empty())
            .map(str::to_string)
            .ok_or_else(|| {
                diagnostics::error("turso.platform.createdWithoutHostname")
                    .with("database", name)
                    .write();

                PlatformError::Unreachable { what }
            })?;

        // requirement 4. Turso's create takes no protection flag, so the database is briefly
        // unprotected for exactly one request, and the create is not done until that request has
        // answered. A create that cannot protect what it made does not hand it back.
        if let Err(error) = self
            .set_delete_protection(
                &client,
                &platform_token,
                name,
                true,
                "protect the workspace database",
            )
            .await
        {
            self.remove_unprotected(&client, &platform_token, name)
                .await;

            return Err(error);
        }

        Ok(WorkspaceDatabase {
            name: name.to_string(),
            hostname,
        })
    }

    async fn mint_token(
        &self,
        database_name: &str,
        expiration: &str,
    ) -> Result<String, PlatformError> {
        let what = "mint a token for this workspace";
        let client = client()?;
        let platform_token = authority()?;

        // reqwest is built without its `query` feature here, so the two parameters are put on
        // the URL by the url crate, which encodes them the same way.
        let mut url = url::Url::parse(&format!("{}/auth/tokens", self.database_url(database_name)))
            .map_err(|_| PlatformError::Unreachable { what })?;
        url.query_pairs_mut()
            .append_pair("expiration", expiration)
            .append_pair("authorization", FULL_ACCESS);

        let body = call(what, client.post(url).bearer_auth(&platform_token)).await?;

        body.get("jwt")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|jwt| !jwt.is_empty())
            .map(str::to_string)
            .ok_or_else(|| {
                diagnostics::error("turso.platform.mintedWithoutJwt")
                    .with("database", database_name)
                    .write();

                PlatformError::Unreachable { what }
            })
    }

    async fn protect_database(&self, name: &str) -> Result<(), PlatformError> {
        let client = client()?;
        let platform_token = authority()?;

        self.set_delete_protection(
            &client,
            &platform_token,
            name,
            true,
            "protect the workspace database",
        )
        .await
    }

    async fn delete_database(
        &self,
        name: &str,
        intent: DeletionIntent,
    ) -> Result<(), PlatformError> {
        let what = "remove the workspace database";
        let client = client()?;
        let platform_token = authority()?;

        diagnostics::info("turso.platform.deletingDatabase")
            .with("database", name)
            .with("intent", format!("{intent:?}"))
            .write();

        // the barrier requirement 4 put up is lifted by the one path allowed through it. The same
        // grant carries `db:configure`, which is why the protection was never a guarantee.
        self.set_delete_protection(&client, &platform_token, name, false, what)
            .await?;

        call(
            what,
            client
                .delete(self.database_url(name))
                .bearer_auth(&platform_token),
        )
        .await
        .map(|_| ())
    }
}

fn client() -> Result<reqwest::Client, PlatformError> {
    build_client(PLATFORM_REQUEST_TIMEOUT).map_err(|error| {
        diagnostics::error("turso.platform.clientNotBuilt")
            .with("error", error.to_string())
            .write();

        PlatformError::Unreachable {
            what: "reach turso",
        }
    })
}

/// The authority this machine holds, read from where the consent filed it.
fn authority() -> Result<String, PlatformError> {
    platform_token().map_err(|_| PlatformError::NoAuthority)
}

/// Send one request and read its JSON body, or say how it failed in the port's vocabulary.
///
/// Turso's own message goes to the diagnostics log and never to the caller, who is asking about a
/// workspace rather than about the infrastructure underneath it.
async fn call(
    what: &'static str,
    request: reqwest::RequestBuilder,
) -> Result<Value, PlatformError> {
    let response = request.send().await.map_err(|error| {
        diagnostics::warn("turso.platform.unreachable")
            .with("what", what)
            .with("error", error.to_string())
            .write();

        PlatformError::Unreachable { what }
    })?;

    let status = response.status();

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();

        diagnostics::error("turso.platform.refused")
            .with("what", what)
            .with("status", status.as_u16().to_string())
            .with("body", body.clone())
            .redacted()
            .write();

        return Err(if status.is_server_error() {
            PlatformError::Unreachable { what }
        } else if belongs_to_the_account(status.as_u16(), &body) {
            PlatformError::AccountRefused { what }
        } else {
            PlatformError::Refused { what }
        });
    }

    Ok(response
        .json()
        .await
        .unwrap_or(Value::Object(Default::default())))
}

/// Whether a refusal is about the customer's account rather than about the request.
///
/// **Turso documents no status for it**, on this endpoint or any other. What it does document is
/// that an exceeded quota blocks the databases and surfaces as a `BLOCKED` error code, and the
/// pricing page says a free plan or one with overages off is blocked the moment any metric is
/// exceeded. So this reads `402 Payment Required`, and otherwise the words Turso uses for the
/// condition in the body it sends, as the signal, at the response and nowhere further up. The first
/// real account refusal anybody sees is what corrects this; until then it is the best reading of
/// what is published.
fn belongs_to_the_account(status: u16, body: &str) -> bool {
    if status == 402 {
        return true;
    }

    let message = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(Value::as_str)
                .map(str::to_lowercase)
        })
        .unwrap_or_default();

    ["quota", "blocked", "billing", "exceeded"]
        .iter()
        .any(|word| message.contains(word))
}

/// A Turso that answers in memory, for every caller above this port.
///
/// It records what it was asked so a test can assert on the calls, and it can be told to refuse
/// the next operation in any of the port's vocabulary so a caller's handling of each answer is
/// testable without a network. Names are unique, as Turso's are, and a database's protection is a
/// fact it keeps, so a caller that deletes without lifting it is refused the way Turso refuses.
#[cfg(test)]
pub(crate) struct InMemoryPlatform {
    slug: String,
    state: std::sync::Mutex<InMemoryState>,
}

#[cfg(test)]
#[derive(Default)]
struct InMemoryState {
    databases: Vec<InMemoryDatabase>,
    minted: Vec<(String, String)>,
    deleted: Vec<(String, DeletionIntent)>,
    refuse_next: Option<PlatformError>,
    /// how many operations have been asked, so a refusal can be placed on the nth.
    asked: usize,
    refuse_at: Option<(usize, PlatformError)>,
}

#[cfg(test)]
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct InMemoryDatabase {
    pub(crate) name: String,
    pub(crate) delete_protection: bool,
}

#[cfg(test)]
impl InMemoryPlatform {
    pub(crate) fn new(slug: &str) -> Self {
        Self {
            slug: slug.to_string(),
            state: std::sync::Mutex::new(InMemoryState::default()),
        }
    }

    /// A database that exists on the account already, unprotected, as the MCP first-create leaves
    /// one, so a caller's protect-after-create is testable.
    pub(crate) fn holding_unprotected(&self, name: &str) {
        self.locked().databases.push(InMemoryDatabase {
            name: name.to_string(),
            delete_protection: false,
        });
    }

    /// the next operation fails with `error`, and the one after it is answered normally.
    pub(crate) fn refuse_next(&self, error: PlatformError) {
        self.locked().refuse_next = Some(error);
    }

    /// the `nth` operation asked of this fake, counting from one, fails with `error`. For a
    /// caller whose sequence is fixed and whose handling of a failure part-way through is what is
    /// under test.
    pub(crate) fn refuse_nth(&self, nth: usize, error: PlatformError) {
        self.locked().refuse_at = Some((nth, error));
    }

    pub(crate) fn databases(&self) -> Vec<InMemoryDatabase> {
        self.locked().databases.clone()
    }

    /// every mint, as `(database, expiration)`, in order.
    pub(crate) fn minted(&self) -> Vec<(String, String)> {
        self.locked().minted.clone()
    }

    pub(crate) fn deleted(&self) -> Vec<(String, DeletionIntent)> {
        self.locked().deleted.clone()
    }

    fn locked(&self) -> std::sync::MutexGuard<'_, InMemoryState> {
        self.state
            .lock()
            .expect("the in-memory platform lock was poisoned")
    }

    fn take_refusal(state: &mut InMemoryState) -> Result<(), PlatformError> {
        state.asked += 1;

        if let Some((nth, _)) = &state.refuse_at
            && *nth == state.asked
            && let Some((_, error)) = state.refuse_at.take()
        {
            return Err(error);
        }

        match state.refuse_next.take() {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
impl TursoPlatform for InMemoryPlatform {
    async fn create_database(&self, name: &str) -> Result<WorkspaceDatabase, PlatformError> {
        let mut state = self.locked();
        Self::take_refusal(&mut state)?;

        if state.databases.iter().any(|database| database.name == name) {
            return Err(PlatformError::Refused {
                what: "create the workspace database",
            });
        }

        state.databases.push(InMemoryDatabase {
            name: name.to_string(),
            delete_protection: true,
        });

        Ok(WorkspaceDatabase {
            name: name.to_string(),
            hostname: format!("{name}-{}.aws-eu-west-1.turso.io", self.slug),
        })
    }

    async fn mint_token(
        &self,
        database_name: &str,
        expiration: &str,
    ) -> Result<String, PlatformError> {
        let mut state = self.locked();
        Self::take_refusal(&mut state)?;

        if !state
            .databases
            .iter()
            .any(|database| database.name == database_name)
        {
            return Err(PlatformError::Refused {
                what: "mint a token for this workspace",
            });
        }

        state
            .minted
            .push((database_name.to_string(), expiration.to_string()));

        Ok(format!("token-for-{database_name}-{expiration}"))
    }

    /// **A name this fake has never seen is taken as a database the MCP server created**, which
    /// is the one way a database arrives on the account without passing through this port, and
    /// the only caller of `protect_database`. Turso would refuse a name that does not exist; the
    /// fake cannot tell that case from the MCP one, and the scripted MCP server in the same test
    /// is what pins the create.
    async fn protect_database(&self, name: &str) -> Result<(), PlatformError> {
        let mut state = self.locked();
        Self::take_refusal(&mut state)?;

        match state
            .databases
            .iter_mut()
            .find(|database| database.name == name)
        {
            Some(database) => database.delete_protection = true,
            None => state.databases.push(InMemoryDatabase {
                name: name.to_string(),
                delete_protection: true,
            }),
        }

        Ok(())
    }

    async fn delete_database(
        &self,
        name: &str,
        intent: DeletionIntent,
    ) -> Result<(), PlatformError> {
        let mut state = self.locked();
        Self::take_refusal(&mut state)?;

        let Some(index) = state
            .databases
            .iter()
            .position(|database| database.name == name)
        else {
            return Err(PlatformError::Refused {
                what: "remove the workspace database",
            });
        };

        state.databases.remove(index);
        state.deleted.push((name.to_string(), intent));

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::sync::google::test::server::{RecordedRequest, ScriptedResponse, ScriptedServer};
    use crate::sync::turso::consent::store_platform_token;
    use crate::sync::turso::discovery::TursoOrganization;

    use super::{
        DeletionIntent, InMemoryPlatform, PlatformApi, PlatformEndpoint, PlatformError,
        TursoPlatform, WorkspaceDatabase, belongs_to_the_account,
    };

    const TOKEN: &str = "a-platform-token";

    fn organization() -> TursoOrganization {
        TursoOrganization {
            slug: "an-org".to_string(),
            group: "rentable".to_string(),
        }
    }

    async fn platform_answering(script: Vec<ScriptedResponse>) -> (PlatformApi, ScriptedServer) {
        store_platform_token(TOKEN).expect("failed to file the test token");

        let server = ScriptedServer::start(script).await;
        let platform = PlatformApi::new(PlatformEndpoint::at(&server.url("")), organization());

        (platform, server)
    }

    fn created(hostname: &str) -> ScriptedResponse {
        ScriptedResponse::new(
            200,
            json!({ "database": { "DbId": "an-id", "Hostname": hostname, "Name": "ws-1" } })
                .to_string(),
        )
    }

    fn configured(protected: bool) -> ScriptedResponse {
        ScriptedResponse::new(200, json!({ "delete_protection": protected }).to_string())
    }

    fn refusal(status: u16, error: &str) -> ScriptedResponse {
        ScriptedResponse::new(status, json!({ "error": error }).to_string())
    }

    fn assert_never_lists_organizations(server: &ScriptedServer) {
        for index in 0..server.request_count() {
            let request: RecordedRequest = server.request(index);
            let path = request.target.split('?').next().unwrap_or_default();

            assert_ne!(
                path, "/v1/organizations",
                "the organizations listing was called, and a group-scoped token answers 403 to it"
            );
        }
    }

    #[tokio::test]
    async fn creating_a_database_names_it_groups_it_protects_it_and_reads_the_hostname_back() {
        let (platform, server) =
            platform_answering(vec![created("ws-1-an-org.turso.io"), configured(true)]).await;

        let database = platform
            .create_database("ws-1")
            .await
            .expect("the create failed");

        assert_eq!(
            database,
            WorkspaceDatabase {
                name: "ws-1".to_string(),
                hostname: "ws-1-an-org.turso.io".to_string()
            }
        );

        let create = server.request(0);

        assert_eq!(create.method, "POST");
        assert_eq!(create.target, "/v1/organizations/an-org/databases");
        assert_eq!(
            create.header("authorization"),
            Some("Bearer a-platform-token")
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&create.body).expect("a json body"),
            json!({ "name": "ws-1", "group": "rentable" })
        );

        // requirement 4: the protection is turned on inside the same operation, and the create is
        // not reported done until it has been.
        let protect = server.request(1);

        assert_eq!(protect.method, "PATCH");
        assert_eq!(
            protect.target,
            "/v1/organizations/an-org/databases/ws-1/configuration"
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&protect.body).expect("a json body"),
            json!({ "delete_protection": true })
        );
        assert_eq!(
            server.request_count(),
            2,
            "the create is two requests and no more"
        );
        assert_never_lists_organizations(&server);
    }

    // The documented spelling is `Hostname`, a Go struct field showing through. A change to it
    // would be a silent total failure of the one route this port exists for, so both are read.
    #[tokio::test]
    async fn either_spelling_of_the_hostname_is_read() {
        let (platform, _server) = platform_answering(vec![
            ScriptedResponse::new(
                200,
                json!({ "database": { "hostname": "ws-2-an-org.turso.io" } }).to_string(),
            ),
            configured(true),
        ])
        .await;

        let database = platform
            .create_database("ws-2")
            .await
            .expect("the create failed");

        assert_eq!(database.hostname, "ws-2-an-org.turso.io");
    }

    /// A database whose protection could not be turned on is not handed back: it is removed
    /// again, and the caller sees the create fail. Nothing unprotected ever leaves this port.
    #[tokio::test]
    async fn a_database_that_cannot_be_protected_is_removed_and_the_create_fails() {
        let (platform, server) = platform_answering(vec![
            created("ws-3-an-org.turso.io"),
            refusal(400, "configuration is not available"),
            ScriptedResponse::new(200, json!({ "database": "ws-3" }).to_string()),
        ])
        .await;

        let error = platform
            .create_database("ws-3")
            .await
            .expect_err("an unprotected database was handed back");

        assert_eq!(
            error,
            PlatformError::Refused {
                what: "protect the workspace database"
            }
        );

        let remove = server.request(2);

        assert_eq!(remove.method, "DELETE");
        assert_eq!(remove.target, "/v1/organizations/an-org/databases/ws-3");
    }

    #[tokio::test]
    async fn minting_asks_for_one_database_full_access_and_the_lifetime_it_was_given() {
        let (platform, server) = platform_answering(vec![ScriptedResponse::new(
            200,
            json!({ "jwt": "a-database-token" }).to_string(),
        )])
        .await;

        let token = platform
            .mint_token("ws-1", "3d")
            .await
            .expect("the mint failed");

        assert_eq!(token, "a-database-token");

        let mint = server.request(0);
        let (path, query) = mint
            .target
            .split_once('?')
            .expect("the mint carries a query");

        assert_eq!(mint.method, "POST");
        assert_eq!(path, "/v1/organizations/an-org/databases/ws-1/auth/tokens");

        let mut parameters: Vec<&str> = query.split('&').collect();
        parameters.sort_unstable();

        assert_eq!(
            parameters,
            vec!["authorization=full-access", "expiration=3d"]
        );
        assert_eq!(
            mint.header("authorization"),
            Some("Bearer a-platform-token")
        );
        assert_never_lists_organizations(&server);
    }

    /// Deleting lifts the protection first, because the create put it there and nothing else
    /// can get past it. The intent is on the call, so a reader of any call site knows why.
    #[tokio::test]
    async fn deleting_lifts_the_protection_then_names_the_database_in_the_path() {
        let (platform, server) = platform_answering(vec![
            configured(false),
            ScriptedResponse::new(200, json!({ "database": "ws-1" }).to_string()),
        ])
        .await;

        platform
            .delete_database("ws-1", DeletionIntent::WorkspaceDeletedByHuman)
            .await
            .expect("the delete failed");

        let lift = server.request(0);

        assert_eq!(lift.method, "PATCH");
        assert_eq!(
            lift.target,
            "/v1/organizations/an-org/databases/ws-1/configuration"
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&lift.body).expect("a json body"),
            json!({ "delete_protection": false })
        );

        let remove = server.request(1);

        assert_eq!(remove.method, "DELETE");
        assert_eq!(remove.target, "/v1/organizations/an-org/databases/ws-1");
        assert_eq!(server.request_count(), 2);
        assert_never_lists_organizations(&server);
    }

    /// The one operation for a database this port did not create: the organization's own, made
    /// through the MCP server on a first run into an empty group.
    #[tokio::test]
    async fn protecting_a_database_this_port_did_not_create_is_the_same_patch() {
        let (platform, server) = platform_answering(vec![configured(true)]).await;

        platform
            .protect_database("org-7f3a")
            .await
            .expect("the protect failed");

        let protect = server.request(0);

        assert_eq!(protect.method, "PATCH");
        assert_eq!(
            protect.target,
            "/v1/organizations/an-org/databases/org-7f3a/configuration"
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&protect.body).expect("a json body"),
            json!({ "delete_protection": true })
        );
        assert_eq!(server.request_count(), 1);
    }

    // Turso's own message names a database and sometimes an organization. The caller is asking
    // about a workspace, not about the infrastructure under it.
    #[tokio::test]
    async fn a_turso_that_refuses_on_purpose_does_not_tell_anybody_to_try_again() {
        let (platform, _server) = platform_answering(vec![refusal(
            409,
            "database ws-1 already exists in organization an-org",
        )])
        .await;

        let error = platform
            .create_database("ws-1")
            .await
            .expect_err("a 409 was read as a created database");

        assert_eq!(
            error,
            PlatformError::Refused {
                what: "create the workspace database"
            }
        );
        assert!(
            !error.to_string().contains("an-org"),
            "the organization went out: {error}"
        );
        assert!(error.to_string().contains("will not help"), "{error}");
    }

    // The one measured against a live account: a delete Turso refuses is a refusal, not a
    // moment that will pass.
    #[tokio::test]
    async fn a_delete_turso_refuses_is_a_refusal_not_a_moment_that_will_pass() {
        let (platform, _server) = platform_answering(vec![
            configured(false),
            refusal(
                403,
                "group rentable is delete-protected and cannot be deleted",
            ),
        ])
        .await;

        let error = platform
            .delete_database("ws-1", DeletionIntent::CreatedAndUnreferenced)
            .await
            .expect_err("a 403 was read as a deleted database");

        assert_eq!(
            error,
            PlatformError::Refused {
                what: "remove the workspace database"
            }
        );
        assert!(
            !error.to_string().contains("rentable"),
            "the group name went out: {error}"
        );
    }

    #[tokio::test]
    async fn a_turso_having_a_bad_minute_is_a_moment_that_will_pass() {
        let (platform, _server) = platform_answering(vec![ScriptedResponse::new(502, "")]).await;

        let error = platform
            .create_database("ws-1")
            .await
            .expect_err("a 502 was read as a created database");

        assert_eq!(
            error,
            PlatformError::Unreachable {
                what: "create the workspace database"
            }
        );
        assert!(error.to_string().contains("try again"), "{error}");
    }

    #[tokio::test]
    async fn a_turso_that_never_answers_is_a_moment_that_will_pass() {
        let (platform, _server) = platform_answering(vec![ScriptedResponse::hangup()]).await;

        let error = platform
            .mint_token("ws-1", "3d")
            .await
            .expect_err("a dropped connection was read as a token");

        assert_eq!(
            error,
            PlatformError::Unreachable {
                what: "mint a token for this workspace"
            }
        );
    }

    /// Requirement 25's distinction is made here, at the response.
    #[tokio::test]
    async fn a_refusal_that_belongs_to_the_account_is_told_apart_from_one_about_the_request() {
        let (platform, _server) = platform_answering(vec![
            refusal(402, "payment required"),
            refusal(400, "plan quota exceeded: databases"),
            refusal(400, "group not found"),
        ])
        .await;

        for _ in 0..2 {
            let error = platform
                .create_database("ws-1")
                .await
                .expect_err("an account refusal was read as a created database");

            assert_eq!(
                error,
                PlatformError::AccountRefused {
                    what: "create the workspace database"
                }
            );
            assert!(error.to_string().contains("account"), "{error}");
            assert!(!error.to_string().contains("sync"), "{error}");
        }

        let error = platform
            .create_database("ws-1")
            .await
            .expect_err("a missing group was read as a created database");

        assert_eq!(
            error,
            PlatformError::Refused {
                what: "create the workspace database"
            }
        );
    }

    #[test]
    fn what_reads_as_the_account_and_what_does_not() {
        assert!(belongs_to_the_account(402, ""));
        assert!(belongs_to_the_account(
            403,
            &json!({ "error": "databases BLOCKED: quota exceeded" }).to_string()
        ));
        assert!(!belongs_to_the_account(
            400,
            &json!({ "error": "group not found" }).to_string()
        ));
        assert!(!belongs_to_the_account(409, "not json at all"));
    }

    #[tokio::test]
    async fn an_answer_with_no_hostname_is_a_failure_rather_than_a_workspace_with_no_database() {
        let (platform, server) = platform_answering(vec![ScriptedResponse::new(
            200,
            json!({ "database": {} }).to_string(),
        )])
        .await;

        let error = platform
            .create_database("ws-1")
            .await
            .expect_err("a database with no hostname was handed back");

        assert!(
            matches!(error, PlatformError::Unreachable { .. }),
            "{error:?}"
        );
        assert_eq!(
            server.request_count(),
            1,
            "nothing was protected or removed, because nothing was known to exist"
        );
    }

    #[tokio::test]
    async fn an_answer_with_no_jwt_is_a_failure_rather_than_an_empty_token() {
        let (platform, _server) =
            platform_answering(vec![ScriptedResponse::new(200, json!({}).to_string())]).await;

        let error = platform
            .mint_token("ws-1", "3d")
            .await
            .expect_err("an empty token was handed back");

        assert!(
            matches!(error, PlatformError::Unreachable { .. }),
            "{error:?}"
        );
    }

    /// Requirement 5: a machine whose consent was given up is told to consent again, and no
    /// request leaves it.
    #[tokio::test]
    async fn no_authority_is_a_refusal_before_any_request_is_made() {
        let (platform, server) = platform_answering(vec![]).await;

        crate::sync::turso::consent::TursoConsent::new()
            .disconnect()
            .expect("failed to disconnect");

        let error = platform
            .create_database("ws-1")
            .await
            .expect_err("a request was made with no authority");

        assert_eq!(error, PlatformError::NoAuthority);
        assert_eq!(server.request_count(), 0);
        assert!(matches!(
            crate::error::Error::from(error),
            crate::error::Error::NotConfigured { .. }
        ));
    }

    #[test]
    fn each_failure_crosses_to_the_web_layer_as_a_fact_and_not_as_tursos_words() {
        use crate::error::Error;

        let what = "create the workspace database";

        assert!(matches!(
            Error::from(PlatformError::Unreachable { what }),
            Error::Network { .. }
        ));
        assert!(matches!(
            Error::from(PlatformError::Refused { what }),
            Error::PreconditionFailed { .. }
        ));
        assert!(matches!(
            Error::from(PlatformError::AccountRefused { what }),
            Error::PreconditionFailed { message } if message.contains("account")
        ));
    }

    /// The in-memory port is what every caller above is tested against, so it has to keep the
    /// facts Turso keeps: names are unique, a create is protected, and a delete is recorded with
    /// its intent.
    #[tokio::test]
    async fn the_in_memory_platform_keeps_the_facts_turso_keeps() {
        let platform = InMemoryPlatform::new("an-org");

        let database = platform
            .create_database("ws-1")
            .await
            .expect("the create failed");

        assert_eq!(database.hostname, "ws-1-an-org.aws-eu-west-1.turso.io");
        assert!(platform.databases()[0].delete_protection);
        assert_eq!(
            platform.create_database("ws-1").await,
            Err(PlatformError::Refused {
                what: "create the workspace database"
            })
        );

        assert_eq!(
            platform.mint_token("ws-1", "3d").await,
            Ok("token-for-ws-1-3d".to_string())
        );
        assert_eq!(
            platform.mint_token("ws-9", "3d").await,
            Err(PlatformError::Refused {
                what: "mint a token for this workspace"
            })
        );

        platform.refuse_next(PlatformError::AccountRefused {
            what: "mint a token for this workspace",
        });
        assert!(matches!(
            platform.mint_token("ws-1", "3d").await,
            Err(PlatformError::AccountRefused { .. })
        ));
        assert_eq!(platform.minted().len(), 1, "a refused mint minted nothing");

        platform.holding_unprotected("org-1");
        assert!(!platform.databases()[1].delete_protection);
        platform
            .protect_database("org-1")
            .await
            .expect("the protect failed");
        assert!(platform.databases()[1].delete_protection);
        // a name never seen is the MCP server's database arriving, and it arrives protected.
        platform
            .protect_database("org-9")
            .await
            .expect("an unseen database was refused");
        assert!(platform.databases()[2].delete_protection);

        platform
            .delete_database("ws-1", DeletionIntent::WorkspaceDeletedByHuman)
            .await
            .expect("the delete failed");

        assert_eq!(platform.databases().len(), 2);
        assert_eq!(
            platform.deleted(),
            vec![("ws-1".to_string(), DeletionIntent::WorkspaceDeletedByHuman)]
        );
    }

    /// Live, once, at the human's request. The fourth property under *Tests that reach a live
    /// remote*: whether the Platform API takes what this port sends. One database is created in
    /// the group the consent named, a credential is minted for it, the protection is read back
    /// from Turso rather than from this port's belief, and the database is deleted by the same
    /// run. Nothing this did not just create is touched ([[references/turso]], *Never run*).
    #[tokio::test]
    #[ignore = "reaches a live Turso account and creates a database; see the module comment"]
    async fn platform_live_creates_protects_mints_and_removes_one_database() {
        let read = |name: &str| {
            std::env::var(name)
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| {
                    panic!("{name} is needed for a live run; see the module comment above")
                })
        };

        assert_eq!(
            read("RENTABLE_LIVE_TURSO"),
            "1",
            "a live run is armed by RENTABLE_LIVE_TURSO=1 as well as by --ignored"
        );

        store_platform_token(&read("TURSO_CONSENT_TOKEN")).expect("failed to file the token");

        let organization = TursoOrganization {
            slug: read("TURSO_ORG"),
            group: read("TURSO_GROUP"),
        };
        let platform = PlatformApi::new(PlatformEndpoint::production(), organization.clone());
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default();
        let name = format!("t819-05-{nonce:x}");

        let database = platform
            .create_database(&name)
            .await
            .expect("the live create failed");

        eprintln!("created {} at {}", database.name, database.hostname);

        // the protection is read back from Turso, not from what this port believes it set.
        let client = crate::http::build_client(super::PLATFORM_REQUEST_TIMEOUT).expect("a client");
        let configuration: serde_json::Value = client
            .get(platform.configuration_url(&name))
            .bearer_auth(read("TURSO_CONSENT_TOKEN"))
            .send()
            .await
            .expect("read the configuration")
            .error_for_status()
            .expect("the configuration read was refused")
            .json()
            .await
            .expect("the configuration body");

        assert_eq!(
            configuration.get("delete_protection"),
            Some(&serde_json::Value::Bool(true)),
            "the database this port created is not delete-protected: {configuration}"
        );

        let token = platform
            .mint_token(&name, "1h")
            .await
            .expect("the live mint failed");

        assert_eq!(
            token.split('.').count(),
            3,
            "the minted credential is not a jwt"
        );

        platform
            .delete_database(&name, DeletionIntent::CreatedAndUnreferenced)
            .await
            .expect("the live delete failed, and the database is left behind");

        eprintln!("removed {name}");
    }
}
