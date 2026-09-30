//! the live adapter: the Platform API reached over HTTPS as the customer's own account, and the
//! one place a live Turso account is touched.

use std::time::Duration;

use serde_json::{Value, json};

use crate::{
    credential::{CredentialStore, Credentials},
    diagnostics,
    error::Error,
    http::build_client,
};

use super::{
    ABSENT, AccessLevel, DeletionIntent, TursoPlatform, WorkspaceDatabase, account_refused,
    belongs_to_the_account, no_authority, turso_refused, unreachable,
};
use crate::turso::{
    consent::platform_token,
    discovery::{TursoOrganization, group_named_in, group_record_from},
};

const TURSO_PLATFORM_API: &str = "https://api.turso.tech";

/// Matches the timeout every other credential-path request in this crate sets.
const PLATFORM_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

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
/// What it holds is the store the consent filed the token in, which is where each call reads it.
#[derive(Clone)]
pub struct PlatformApi {
    endpoint: PlatformEndpoint,
    organization: TursoOrganization,
    credentials: Credentials,
}

/// the store is left out: it is a port, and what it would print is nothing a reader needs.
impl std::fmt::Debug for PlatformApi {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PlatformApi")
            .field("endpoint", &self.endpoint)
            .field("organization", &self.organization)
            .finish_non_exhaustive()
    }
}

impl PlatformApi {
    pub(crate) fn new(
        endpoint: PlatformEndpoint,
        organization: TursoOrganization,
        credentials: Credentials,
    ) -> Self {
        Self {
            endpoint,
            organization,
            credentials,
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
    ) -> Result<(), Error> {
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
    async fn create_database(&self, name: &str) -> Result<WorkspaceDatabase, Error> {
        let what = "create the workspace database";
        let client = client()?;
        let platform_token = authority(self.credentials.as_ref())?;

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

                unreachable(what)
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

    /// **The create, with a seed.** Turso makes a database from another in the same group when the
    /// create names it as `seed: {type: "database", name}`, and the protection follows in the same
    /// second request a create makes, for the same reason.
    async fn copy_database(&self, source: &str, name: &str) -> Result<(), Error> {
        let what = "copy the database";
        let client = client()?;
        let platform_token = authority(self.credentials.as_ref())?;

        call(
            what,
            client
                .post(format!("{}/databases", self.organization_url()))
                .bearer_auth(&platform_token)
                .json(&json!({
                    "name": name,
                    "group": self.organization.group,
                    "seed": { "type": "database", "name": source },
                })),
        )
        .await?;

        if let Err(error) = self
            .set_delete_protection(
                &client,
                &platform_token,
                name,
                true,
                "protect the copy of the database",
            )
            .await
        {
            self.remove_unprotected(&client, &platform_token, name)
                .await;

            return Err(error);
        }

        Ok(())
    }

    async fn mint_token(
        &self,
        database_name: &str,
        expiration: &str,
        access: AccessLevel,
    ) -> Result<String, Error> {
        let what = "mint a token for this workspace";
        let client = client()?;
        let platform_token = authority(self.credentials.as_ref())?;

        // reqwest is built without its `query` feature here, so the two parameters are put on
        // the URL by the url crate, which encodes them the same way.
        let mut url = url::Url::parse(&format!("{}/auth/tokens", self.database_url(database_name)))
            .map_err(|_| unreachable(what))?;
        url.query_pairs_mut()
            .append_pair("expiration", expiration)
            .append_pair("authorization", access.as_str());

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

                unreachable(what)
            })
    }

    async fn group_named(
        &self,
        platform_token: &str,
        group_uuid: Option<&str>,
    ) -> Result<Option<String>, Error> {
        let what = "read the name of the organization's turso group";
        let client = client()?;

        // the one endpoint here with no organization in its path, which is the whole reason this
        // is the call a run with no slug can make.
        let Some(user) = call_unless(
            what,
            client
                .get(format!("{}/v1/user", self.endpoint.base))
                .bearer_auth(platform_token),
            &ABSENT,
        )
        .await?
        else {
            return Ok(None);
        };

        // a personal account's organization slug is the username, and nothing else this answers
        // is read. On a team account the slug is the team's and this path is a 404, which is an
        // answer rather than a failure.
        let Some(username) = user
            .pointer("/user/username")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|username| !username.is_empty())
        else {
            return Ok(None);
        };

        let Some(listed) = call_unless(
            what,
            client
                .get(format!(
                    "{}/v1/organizations/{username}/groups",
                    self.endpoint.base
                ))
                .bearer_auth(platform_token),
            &ABSENT,
        )
        .await?
        else {
            return Ok(None);
        };

        let groups: Vec<_> = listed
            .get("groups")
            .and_then(Value::as_array)
            .map(|groups| groups.iter().filter_map(group_record_from).collect())
            .unwrap_or_default();

        Ok(group_named_in(&groups, group_uuid))
    }

    async fn protect_database(&self, name: &str) -> Result<(), Error> {
        let client = client()?;
        let platform_token = authority(self.credentials.as_ref())?;

        self.set_delete_protection(
            &client,
            &platform_token,
            name,
            true,
            "protect the workspace database",
        )
        .await
    }

    async fn rotate_credentials(&self, database_name: &str) -> Result<(), Error> {
        let what = "lock the removed member out of this workspace";
        let client = client()?;
        let platform_token = authority(self.credentials.as_ref())?;

        call(
            what,
            client
                .post(format!("{}/auth/rotate", self.database_url(database_name)))
                .bearer_auth(&platform_token),
        )
        .await
        .map(|_| ())
    }

    async fn delete_database(&self, name: &str, intent: DeletionIntent) -> Result<(), Error> {
        let what = "remove the workspace database";
        let client = client()?;
        let platform_token = authority(self.credentials.as_ref())?;

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

fn client() -> Result<reqwest::Client, Error> {
    build_client(PLATFORM_REQUEST_TIMEOUT).map_err(|error| {
        diagnostics::error("turso.platform.clientNotBuilt")
            .with("error", error.to_string())
            .write();

        unreachable("reach turso")
    })
}

/// The authority this machine holds, read from where the consent filed it.
fn authority(credentials: &dyn CredentialStore) -> Result<String, Error> {
    platform_token(credentials).map_err(|_| no_authority())
}

/// Send one request and read its JSON body, or say how it failed in the port's vocabulary.
///
/// Turso's own message goes to the diagnostics log and never to the caller, who is asking about a
/// workspace rather than about the infrastructure underneath it.
async fn call(what: &'static str, request: reqwest::RequestBuilder) -> Result<Value, Error> {
    // no status is an absence here, so the `None` below cannot be reached; the empty object is
    // what an unreadable body already answers.
    call_unless(what, request, &[])
        .await
        .map(|body| body.unwrap_or_else(|| Value::Object(Default::default())))
}

/// The same call, answering `None` where Turso refused with one of `absent` rather than treating
/// that refusal as a failure. Only a caller asking whether something exists passes any.
async fn call_unless(
    what: &'static str,
    request: reqwest::RequestBuilder,
    absent: &[u16],
) -> Result<Option<Value>, Error> {
    let response = request.send().await.map_err(|error| {
        diagnostics::warn("turso.platform.unreachable")
            .with("what", what)
            .with("error", error.to_string())
            .write();

        unreachable(what)
    })?;

    let status = response.status();

    if !status.is_success() {
        // an answer rather than a failure, so it is not written as one: the caller asked whether
        // something was there and Turso said it was not. Turso's own words are not read, because
        // there is nothing here for them to explain.
        if absent.contains(&status.as_u16()) {
            diagnostics::info("turso.platform.absent")
                .with("what", what)
                .with("status", status.as_u16().to_string())
                .write();

            return Ok(None);
        }

        let body = response.text().await.unwrap_or_default();

        diagnostics::error("turso.platform.refused")
            .with("what", what)
            .with("status", status.as_u16().to_string())
            .with("body", body.clone())
            .redacted()
            .write();

        return Err(if status.is_server_error() {
            unreachable(what)
        } else if belongs_to_the_account(status.as_u16(), &body) {
            account_refused(what)
        } else {
            turso_refused(what)
        });
    }

    Ok(Some(
        response
            .json()
            .await
            .unwrap_or(Value::Object(Default::default())),
    ))
}

#[cfg(test)]
mod tests {
    use crate::credential::Memory;
    use crate::error::Error;
    use crate::sync::test::server::{RecordedRequest, ScriptedResponse, ScriptedServer};
    use crate::turso::consent::store_platform_token;
    use crate::turso::discovery::TursoOrganization;
    use crate::turso::platform::{
        AccessLevel, DeletionIntent, PlatformApi, PlatformEndpoint, TursoPlatform,
        WorkspaceDatabase, account_refused, no_authority, turso_refused, unreachable,
    };
    use serde_json::json;
    use std::sync::Arc;

    const TOKEN: &str = "a-platform-token";

    fn organization() -> TursoOrganization {
        TursoOrganization {
            slug: "an-org".to_string(),
            group: "rentable".to_string(),
        }
    }

    /// a platform with the test token filed in a credential store of the test's own, and that
    /// store, for a test that changes what is filed in it.
    async fn platform_answering(
        script: Vec<ScriptedResponse>,
    ) -> (PlatformApi, ScriptedServer, Arc<Memory>) {
        let credentials = Arc::new(Memory::new());
        store_platform_token(credentials.as_ref(), TOKEN).expect("failed to file the test token");

        let server = ScriptedServer::start(script).await;
        let platform = PlatformApi::new(
            PlatformEndpoint::at(&server.url("")),
            organization(),
            credentials.clone(),
        );

        (platform, server, credentials)
    }

    /// A client against a scripted server, over an empty credential store. `group_named` is
    /// handed the token it spends, so the store is not in its way, and a test that scripts two
    /// accounts can stand up two of these.
    async fn platform_at(script: Vec<ScriptedResponse>) -> (PlatformApi, ScriptedServer) {
        let server = ScriptedServer::start(script).await;
        let platform = PlatformApi::new(
            PlatformEndpoint::at(&server.url("")),
            organization(),
            Arc::new(Memory::new()),
        );

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
        let (platform, server, _credentials) =
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
        let (platform, _server, _credentials) = platform_answering(vec![
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
        let (platform, server, _credentials) = platform_answering(vec![
            created("ws-3-an-org.turso.io"),
            refusal(400, "configuration is not available"),
            ScriptedResponse::new(200, json!({ "database": "ws-3" }).to_string()),
        ])
        .await;

        let error = platform
            .create_database("ws-3")
            .await
            .expect_err("an unprotected database was handed back");

        assert_eq!(error, turso_refused("protect the workspace database"));

        let remove = server.request(2);

        assert_eq!(remove.method, "DELETE");
        assert_eq!(remove.target, "/v1/organizations/an-org/databases/ws-3");
    }

    /// A copy is the create with a seed naming the database it copies, in the same group, and the
    /// same protection after it (effort 838, ticket 27).
    #[tokio::test]
    async fn copying_a_database_seeds_it_from_the_source_in_the_group_and_protects_it() {
        let (platform, server, _credentials) = platform_answering(vec![
            created("org-1-copy-an-org.turso.io"),
            configured(true),
        ])
        .await;

        platform
            .copy_database("org-1", "org-1-copy")
            .await
            .expect("the copy failed");

        let create = server.request(0);

        assert_eq!(create.method, "POST");
        assert_eq!(create.target, "/v1/organizations/an-org/databases");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&create.body).expect("a json body"),
            json!({
                "name": "org-1-copy",
                "group": "rentable",
                "seed": { "type": "database", "name": "org-1" }
            })
        );

        let protect = server.request(1);

        assert_eq!(protect.method, "PATCH");
        assert_eq!(
            protect.target,
            "/v1/organizations/an-org/databases/org-1-copy/configuration"
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&protect.body).expect("a json body"),
            json!({ "delete_protection": true })
        );
        assert_eq!(server.request_count(), 2);
    }

    /// A copy whose protection could not be turned on is removed again, and the copy fails.
    #[tokio::test]
    async fn a_copy_that_cannot_be_protected_is_removed_and_the_copy_fails() {
        let (platform, server, _credentials) = platform_answering(vec![
            created("org-1-copy-an-org.turso.io"),
            refusal(400, "configuration is not available"),
            ScriptedResponse::new(200, json!({ "database": "org-1-copy" }).to_string()),
        ])
        .await;

        let error = platform
            .copy_database("org-1", "org-1-copy")
            .await
            .expect_err("an unprotected copy was kept");

        assert_eq!(error, turso_refused("protect the copy of the database"));

        let remove = server.request(2);

        assert_eq!(remove.method, "DELETE");
        assert_eq!(
            remove.target,
            "/v1/organizations/an-org/databases/org-1-copy"
        );
    }

    #[tokio::test]
    async fn minting_asks_for_one_database_full_access_and_the_lifetime_it_was_given() {
        let (platform, server, _credentials) = platform_answering(vec![ScriptedResponse::new(
            200,
            json!({ "jwt": "a-database-token" }).to_string(),
        )])
        .await;

        let token = platform
            .mint_token("ws-1", "3d", AccessLevel::FullAccess)
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
        let (platform, server, _credentials) = platform_answering(vec![
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
        let (platform, server, _credentials) = platform_answering(vec![configured(true)]).await;

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

    /// **Ticket 21.** The second of the two ways a first run learns the group's name: the one
    /// endpoint that takes no slug names the person, a personal account's organization slug is
    /// that username, and the groups under it carry the name against the uuid the consent's
    /// token holds.
    #[tokio::test]
    async fn the_group_is_read_from_the_user_and_the_groups_listed_under_their_username() {
        let (platform, server) = platform_at(vec![
            ScriptedResponse::new(200, json!({ "user": { "username": "olivia" } }).to_string()),
            ScriptedResponse::new(
                200,
                json!({ "groups": [
                    { "name": "rents", "uuid": "11111111-1111-4111-8111-111111111111" },
                    {
                        "name": "rentable-empty",
                        "uuid": "6f5b6f60-1d4a-4b4a-9c2e-0b0a1d2c3e4f",
                        "locations": ["aws-eu-west-1"],
                        "primary": "aws-eu-west-1"
                    }
                ] })
                .to_string(),
            ),
        ])
        .await;

        let named = platform
            .group_named(TOKEN, Some("6f5b6f60-1d4a-4b4a-9c2e-0b0a1d2c3e4f"))
            .await
            .expect("the group lookup failed");

        assert_eq!(named.as_deref(), Some("rentable-empty"));

        let user = server.request(0);

        assert_eq!(user.method, "GET");
        assert_eq!(user.target, "/v1/user");
        assert_eq!(
            user.header("authorization"),
            Some("Bearer a-platform-token")
        );

        let groups = server.request(1);

        assert_eq!(groups.method, "GET");
        assert_eq!(groups.target, "/v1/organizations/olivia/groups");
        assert_eq!(
            groups.header("authorization"),
            Some("Bearer a-platform-token")
        );
        assert_eq!(server.request_count(), 2, "two reads, and nothing else");
        assert_never_lists_organizations(&server);
    }

    /// A team organization's slug is not the owner's username, so the path built out of it is
    /// one this token is not in and Turso refuses it. That is the answer being absent rather
    /// than a first run that cannot continue, and the same holds on either call.
    #[tokio::test]
    async fn a_refusal_on_either_group_call_is_nothing_found_rather_than_a_failure() {
        let (platform, server) = platform_at(vec![
            ScriptedResponse::new(200, json!({ "user": { "username": "olivia" } }).to_string()),
            refusal(403, "you are not a member of organization olivia"),
        ])
        .await;

        assert_eq!(
            platform
                .group_named(TOKEN, Some("6f5b6f60-1d4a-4b4a-9c2e-0b0a1d2c3e4f"))
                .await
                .expect("a 403 on the groups listing was reported as a failure"),
            None
        );
        assert_eq!(server.request_count(), 2);

        let (refused, _server) = platform_at(vec![refusal(404, "not found")]).await;

        assert_eq!(
            refused
                .group_named(TOKEN, None)
                .await
                .expect("a 404 on the user endpoint was reported as a failure"),
            None
        );
    }

    /// And a refusal that is neither is still a refusal: a token Turso will not take at all is
    /// not a group this run should go on to ask somebody about.
    #[tokio::test]
    async fn a_refusal_that_is_not_an_absence_is_still_a_failure() {
        let (platform, _server) = platform_at(vec![refusal(401, "unauthorized")]).await;

        assert_eq!(
            platform.group_named(TOKEN, None).await,
            Err(turso_refused(
                "read the name of the organization's turso group"
            ))
        );
    }

    /// Where the uuid names none of the groups, one group is the answer and several are not.
    #[tokio::test]
    async fn one_group_is_the_answer_and_several_with_no_match_are_not() {
        let user =
            || ScriptedResponse::new(200, json!({ "user": { "username": "o" } }).to_string());
        let (only, _server) = platform_at(vec![
            user(),
            ScriptedResponse::new(
                200,
                json!({ "groups": [{ "name": "rentable-empty", "uuid": "a-uuid" }] }).to_string(),
            ),
        ])
        .await;

        assert_eq!(
            only.group_named(TOKEN, None)
                .await
                .expect("the group lookup failed")
                .as_deref(),
            Some("rentable-empty")
        );

        let (several, _server) = platform_at(vec![
            user(),
            ScriptedResponse::new(
                200,
                json!({ "groups": [
                    { "name": "rents", "uuid": "one" },
                    { "name": "somebody-elses", "uuid": "another" }
                ] })
                .to_string(),
            ),
        ])
        .await;

        assert_eq!(
            several
                .group_named(TOKEN, Some("a-uuid-neither-of-them-carries"))
                .await
                .expect("the group lookup failed"),
            None,
            "one of two groups was picked for a uuid that names neither"
        );
    }

    // Turso's own message names a database and sometimes an organization. The caller is asking
    // about a workspace, not about the infrastructure under it.
    #[tokio::test]
    async fn a_turso_that_refuses_on_purpose_does_not_tell_anybody_to_try_again() {
        let (platform, _server, _credentials) = platform_answering(vec![refusal(
            409,
            "database ws-1 already exists in organization an-org",
        )])
        .await;

        let error = platform
            .create_database("ws-1")
            .await
            .expect_err("a 409 was read as a created database");

        assert_eq!(error, turso_refused("create the workspace database"));
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
        let (platform, _server, _credentials) = platform_answering(vec![
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

        assert_eq!(error, turso_refused("remove the workspace database"));
        assert!(
            !error.to_string().contains("rentable"),
            "the group name went out: {error}"
        );
    }

    #[tokio::test]
    async fn a_turso_having_a_bad_minute_is_a_moment_that_will_pass() {
        let (platform, _server, _credentials) =
            platform_answering(vec![ScriptedResponse::new(502, "")]).await;

        let error = platform
            .create_database("ws-1")
            .await
            .expect_err("a 502 was read as a created database");

        assert_eq!(error, unreachable("create the workspace database"));
        assert!(error.to_string().contains("try again"), "{error}");
    }

    #[tokio::test]
    async fn a_turso_that_never_answers_is_a_moment_that_will_pass() {
        let (platform, _server, _credentials) =
            platform_answering(vec![ScriptedResponse::hangup()]).await;

        let error = platform
            .mint_token("ws-1", "3d", AccessLevel::FullAccess)
            .await
            .expect_err("a dropped connection was read as a token");

        assert_eq!(error, unreachable("mint a token for this workspace"));
    }

    /// Requirement 25's distinction is made here, at the response.
    #[tokio::test]
    async fn a_refusal_that_belongs_to_the_account_is_told_apart_from_one_about_the_request() {
        let (platform, _server, _credentials) = platform_answering(vec![
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

            assert_eq!(error, account_refused("create the workspace database"));
            assert!(error.to_string().contains("account"), "{error}");
            assert!(!error.to_string().contains("sync"), "{error}");
        }

        let error = platform
            .create_database("ws-1")
            .await
            .expect_err("a missing group was read as a created database");

        assert_eq!(error, turso_refused("create the workspace database"));
    }

    #[tokio::test]
    async fn an_answer_with_no_hostname_is_a_failure_rather_than_a_workspace_with_no_database() {
        let (platform, server, _credentials) = platform_answering(vec![ScriptedResponse::new(
            200,
            json!({ "database": {} }).to_string(),
        )])
        .await;

        let error = platform
            .create_database("ws-1")
            .await
            .expect_err("a database with no hostname was handed back");

        assert!(matches!(error, Error::Network { .. }), "{error:?}");
        assert_eq!(
            server.request_count(),
            1,
            "nothing was protected or removed, because nothing was known to exist"
        );
    }

    #[tokio::test]
    async fn an_answer_with_no_jwt_is_a_failure_rather_than_an_empty_token() {
        let (platform, _server, _credentials) =
            platform_answering(vec![ScriptedResponse::new(200, json!({}).to_string())]).await;

        let error = platform
            .mint_token("ws-1", "3d", AccessLevel::ReadOnly)
            .await
            .expect_err("an empty token was handed back");

        assert!(matches!(error, Error::Network { .. }), "{error:?}");
    }

    /// Requirement 5: a machine whose consent was given up is told to consent again, and no
    /// request leaves it.
    #[tokio::test]
    async fn no_authority_is_a_refusal_before_any_request_is_made() {
        let (platform, server, credentials) = platform_answering(vec![]).await;

        crate::turso::consent::TursoConsent::new()
            .disconnect(credentials.as_ref())
            .expect("failed to disconnect");

        let error = platform
            .create_database("ws-1")
            .await
            .expect_err("a request was made with no authority");

        assert_eq!(error, no_authority());
        assert_eq!(server.request_count(), 0);
        assert!(matches!(
            error,
            crate::error::Error::Refused {
                reason: crate::error::RefusalReason::TursoNotConnected,
                ..
            }
        ));
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

        let credentials = Arc::new(Memory::new());
        store_platform_token(credentials.as_ref(), &read("TURSO_CONSENT_TOKEN"))
            .expect("failed to file the token");

        let organization = TursoOrganization {
            slug: read("TURSO_ORG"),
            group: read("TURSO_GROUP"),
        };
        let platform = PlatformApi::new(
            PlatformEndpoint::production(),
            organization.clone(),
            credentials,
        );
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
            .mint_token(&name, "1h", AccessLevel::FullAccess)
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
