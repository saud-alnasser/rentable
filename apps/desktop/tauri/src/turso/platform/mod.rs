//! Turso's Platform API, as this application uses it.
//!
//! **A port, not a client.** Everything above this module reaches Turso through
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
//! human is deleting that workspace in the interface, and effort 828's requirement 18 adds the one
//! other act a person performs deliberately, the owner deleting the whole organization; a port
//! offering deletion as freely as creation would leave that unenforceable from outside. The intent
//! is a value the caller has to construct and name, so the reason is on the record at every call
//! site and a reviewer can read them all.
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
//! the slug and the group are handed to this port by `discovery/` and by the customer's own
//! preparation in Turso's dashboard.
//!
//! **One test here reaches Turso**, admitted in [[rules/testing]] under *Tests that reach a live
//! remote* as the fourth property: whether the Platform API takes what a Rust port sends. It
//! carries `#[ignore]` and panics rather than skipping when its variables are absent, for the
//! reason `discovery/` gives. It creates one database in the group the consent named, mints a
//! credential for it, reads the protection back, and deletes what it made. It is run at the human's
//! request and never as part of a sweep ([[references/turso]], *Never run*).
//!
//! ```text
//! RENTABLE_LIVE_TURSO=1 TURSO_CONSENT_TOKEN=… TURSO_ORG=… TURSO_GROUP=… \
//!   cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml \
//!   platform_live -- --test-threads=1 --ignored --nocapture
//! ```

mod live;
#[cfg(test)]
mod memory;

pub use live::*;
#[cfg(test)]
pub(crate) use memory::*;

use std::future::Future;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{Error, RefusalReason};

/// What a refusal means where the question is whether something is there at all: not there.
///
/// Both statuses are answers rather than failures on the two group calls, and for the same
/// reason. A team organization's slug is not the owner's username, so the path built out of it
/// names an organization this token is not in, and Turso says so with one of these. The caller
/// asks somebody instead of stopping.
const ABSENT: [u16; 2] = [403, 404];

/// What a minted credential is good for. The mint exposes `full-access | read-only` and nothing
/// finer, which is the granularity every grant in the organization has.
///
/// `turso.ts` minted `full-access` alone; the read-only half arrived with the workspace ticket,
/// because requirement 11's read-only member is refused by Turso rather than by the interface,
/// and Turso refuses on the credential it minted.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AccessLevel {
    FullAccess,
    ReadOnly,
}

impl AccessLevel {
    /// The spelling Turso's mint takes and a grant row stores.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::FullAccess => "full-access",
            Self::ReadOnly => "read-only",
        }
    }

    /// The spelling read back off a grant row. Anything else is a row nobody here wrote.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "full-access" => Some(Self::FullAccess),
            "read-only" => Some(Self::ReadOnly),
            _ => None,
        }
    }
}

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
/// **The three variants are the three callers [[references/turso]] permits under *Never run***,
/// and nothing else is one: a database is somebody's ledger, and the only reasons to remove one
/// are that its owner is removing the workspace, now, in the interface, that its owner is deleting
/// the whole organization, now, in the interface, or that this process made it a moment ago and
/// could not finish making it a workspace, so nothing refers to it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DeletionIntent {
    /// the human is deleting this workspace in the interface, at this moment. Requirement 4.
    WorkspaceDeletedByHuman,
    /// the owner is deleting the organization in the interface, at this moment: every workspace
    /// database and then the organization's own directory go together, because a workspace left
    /// behind is a ledger nothing names any more. Effort 828, requirement 18.
    OrganizationDeletedByHuman,
    /// this process created the database and what it was created for did not complete, so the
    /// database is unreferenced and would otherwise be left behind on the customer's account.
    CreatedAndUnreferenced,
}

// How a Platform API operation fails, in the vocabulary a caller can act on: four answers, each an
// [`Error`] as it crosses to the web layer.
//
// The `what` in each is the operation as a person would name it, `create the workspace database`
// and the like, so the message reads as a sentence about a workspace rather than about the
// infrastructure under it. A refusal crosses with a reason of its own, so the interface says a
// sentence about the account where the account is what Turso refused over, and the message naming
// it stays a developer's description (effort 832, requirement 23).
//
// *These were `PlatformError`'s four variants and the `From` that turned each into an `Error`, until
// effort 840 left the crate one error type (ticket 47). Each is the `Error` that conversion made,
// word for word.*

/// the request never arrived, or Turso could not serve it. Asking again is the right response.
pub(crate) fn unreachable(what: &str) -> Error {
    Error::Network {
        message: format!("could not {what} just now. try again in a moment"),
    }
}

/// Turso refused on purpose: a group that does not exist, a name already taken, a database that
/// is delete-protected. Nothing about asking again changes the answer.
pub(crate) fn turso_refused(what: &str) -> Error {
    Error::refused(
        RefusalReason::TursoRefused,
        format!("could not {what}. trying again will not help"),
    )
}

/// the refusal belongs to the customer's account, a quota or a bill, and not to the request.
/// Requirement 25 tells this one from the two above.
pub(crate) fn account_refused(what: &str) -> Error {
    Error::refused(
        RefusalReason::TursoAccountRefused,
        format!(
            "could not {what}: the organization's turso account needs attention before this can \
             continue"
        ),
    )
}

/// this machine holds no Turso authority, because no consent was granted or it was given up.
/// Requirement 5: the answer is to consent again.
pub(crate) fn no_authority() -> Error {
    Error::refused(
        RefusalReason::TursoNotConnected,
        "this machine holds no turso authority. grant the consent again to continue",
    )
}

/// Turso no longer accepts the consent an organization was granted: the token it issued is
/// refused as `invalid api token`. [`PlatformApi`] lets the token go before answering this, so the
/// settings read the organization as not connected and offer the connect card, which is what the
/// sentence tells the owner to press.
pub(crate) fn consent_lost(what: &str) -> Error {
    Error::refused(
        RefusalReason::TursoConsentLost,
        format!(
            "could not {what}: turso no longer accepts this organization's consent. connect \
             turso again from the organization's settings"
        ),
    )
}

/// Whether a refusal says the bearer token itself is no longer one Turso accepts.
///
/// **`401 {"error":"invalid api token"}` and nothing broader.** Seen live on 2026-10-06 against
/// an organization's own consent, after the owner granted a second consent on the same Turso
/// account, and the same answer comes back for a well-formed token Turso did not issue
/// ([[references/turso]], *Failure handling*). A 401 with any other sentence is left to
/// [`turso_refused`], so a refusal this has not been shown is never read as a reason to let a
/// consent go.
fn consent_no_longer_accepted(status: u16, body: &str) -> bool {
    status == 401
        && error_text(body)
            .to_lowercase()
            .contains("invalid api token")
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
    ) -> impl Future<Output = Result<WorkspaceDatabase, Error>> + Send;

    /// Copy `source` into a new database `name` in the same group, seeded from it, with delete
    /// protection on: the copy taken before a database changes shape (`backup.rs`). A copy that
    /// could not be protected is removed again and reported as not made, as a create is.
    fn copy_database(
        &self,
        source: &str,
        name: &str,
    ) -> impl Future<Output = Result<(), Error>> + Send;

    /// A token for one database at `access`, expiring after `expiration` in Turso's own duration
    /// spelling, `3d` and the like, or `never`.
    fn mint_token(
        &self,
        database_name: &str,
        expiration: &str,
        access: AccessLevel,
    ) -> impl Future<Output = Result<String, Error>> + Send;

    /// Remove `name`, lifting its delete protection first. The intent is the caller's statement of
    /// why, and there is no way to call this without making one.
    fn delete_database(
        &self,
        name: &str,
        intent: DeletionIntent,
    ) -> impl Future<Output = Result<(), Error>> + Send;

    /// Turn delete protection on for a database this port did not create.
    ///
    /// One caller: the first run into an empty group, where the organization's database is
    /// created through the MCP server because no slug exists yet for this port to create it with
    /// (`discovery/`). Everything this port creates itself is protected inside the create.
    fn protect_database(&self, name: &str) -> impl Future<Output = Result<(), Error>> + Send;

    /// Invalidate every credential ever minted for `database_name`, at once. Turso revokes per
    /// database and totally; nothing finer exists, which is why an ordinary removal never calls
    /// this and a lock-out does, knowing that every remaining member of that workspace stops
    /// syncing until they collect a fresh credential (`organization/member/removal.rs`).
    fn rotate_credentials(
        &self,
        database_name: &str,
    ) -> impl Future<Output = Result<(), Error>> + Send;

    /// What the consented group is called, where the Platform API will say it.
    ///
    /// **The one call in this port that builds no path out of the slug**, and it is here because
    /// of when it is made: a first run into an empty group has no slug yet, and the group's name
    /// is what the create it is about to make needs. `GET /v1/user` takes none and names the
    /// person, and a personal account's organization slug is that username, so the groups under
    /// it can be listed and the one the consent's uuid names read out.
    ///
    /// **The token is handed in rather than read.** Every other method here reads the keyring at
    /// the call, because a consent the owner gave up must stop being spent; this one is made in
    /// the middle of a first run that is already holding the token it was given, and passing it
    /// keeps that run reading one authority throughout.
    ///
    /// `None` wherever the answer is not there to be had: an account whose slug is not the
    /// username, which Turso refuses with a 403 or a 404, a uuid naming none of the groups
    /// listed, or several groups and no uuid to pick between them. The caller has another way.
    fn group_named(
        &self,
        platform_token: &str,
        group_uuid: Option<&str>,
    ) -> impl Future<Output = Result<Option<String>, Error>> + Send;
}

/// A shared port is a port: a caller that is handed the platform by a factory can keep a handle on
/// the same one, which is what lets a test read back what an in-memory platform was asked.
impl<T: TursoPlatform + Sync + Send> TursoPlatform for std::sync::Arc<T> {
    async fn create_database(&self, name: &str) -> Result<WorkspaceDatabase, Error> {
        (**self).create_database(name).await
    }

    async fn copy_database(&self, source: &str, name: &str) -> Result<(), Error> {
        (**self).copy_database(source, name).await
    }

    async fn mint_token(
        &self,
        database_name: &str,
        expiration: &str,
        access: AccessLevel,
    ) -> Result<String, Error> {
        (**self).mint_token(database_name, expiration, access).await
    }

    async fn delete_database(&self, name: &str, intent: DeletionIntent) -> Result<(), Error> {
        (**self).delete_database(name, intent).await
    }

    async fn protect_database(&self, name: &str) -> Result<(), Error> {
        (**self).protect_database(name).await
    }

    async fn rotate_credentials(&self, database_name: &str) -> Result<(), Error> {
        (**self).rotate_credentials(database_name).await
    }

    async fn group_named(
        &self,
        platform_token: &str,
        group_uuid: Option<&str>,
    ) -> Result<Option<String>, Error> {
        (**self).group_named(platform_token, group_uuid).await
    }
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
///
/// **A permission refusal is not the account's, and Turso spells it `BLOCKED` too.** Seen live
/// on 2026-09-11: a read-only credential's write is refused as `BLOCKED: SQL write operations are
/// forbidden (current session doesn't have write permission)`. A body that names a permission is
/// read as the credential's before the word `blocked` is looked at, so a member on a read-only
/// grant is not told the account needs attention.
fn belongs_to_the_account(status: u16, body: &str) -> bool {
    if status == 402 {
        return true;
    }

    let message = error_text(body).to_lowercase();

    if [
        "permission",
        "forbidden",
        "unauthorized",
        "not allowed",
        "invalid jwt",
    ]
    .iter()
    .any(|word| message.contains(word))
    {
        return false;
    }

    ["quota", "blocked", "billing", "exceeded", "payment"]
        .iter()
        .any(|word| message.contains(word))
}

/// The prose in a Turso error body, or the body itself where it is not the JSON shape Turso
/// sends.
fn error_text(body: &str) -> String {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| body.trim().to_string())
}

/// Why a replication did not go, read off the sync engine's error at the response: the refusal,
/// or nothing where nothing was refused.
///
/// **The same reading the Platform API gets, applied to the other place Turso answers.** The
/// engine reports an HTTP refusal as `status=NNN, body=...` inside its message, and that is the
/// response; what is read is the status and the body Turso sent, never a word three layers up.
/// A refusal that names the account is the account's (requirement 25), `TursoAccountRefused`
/// carrying Turso's own sentence, which is for the owner and nobody else; a `401` or `403`, which
/// a rotated or expired credential answers with, is the credential's, `Error::Credential`, and
/// what `organization::reconnect` acts on; anything else is a machine that could not reach the
/// remote, or reached it and was not refused, which is the offline case and needs a different
/// sentence from either.
///
/// *This answered a `SyncRefusal` of its own, whose `None` is the `None` here, until effort 840
/// left the crate one error type (ticket 47).*
pub fn read_sync_refusal(error: &turso::Error) -> Option<Error> {
    let text = error.to_string();
    let (status, body) = status_and_body(&text)?;

    if belongs_to_the_account(status, body) {
        return Some(Error::refused(
            RefusalReason::TursoAccountRefused,
            error_text(body),
        ));
    }

    if status == 401 || status == 403 {
        return Some(Error::Credential {
            message: CREDENTIAL_NOT_ACCEPTED.to_string(),
        });
    }

    None
}

/// What a replication refused over its credential says, to whoever reads a log.
pub(crate) const CREDENTIAL_NOT_ACCEPTED: &str =
    "the credential this machine holds is not accepted any more";

/// Whether a refused replication says the database is not on the platform any more.
///
/// **The one status, and deliberately not a range.** A deleted database is gone rather than
/// refused, so the remote answers the request for something that is not there; a `401` or a `403`
/// is a credential that lapsed or was rotated and the replica goes on serving what it holds, and a
/// machine that reached nothing at all carries no status. Reading a wider range here would let a
/// credential this machine could simply renew wipe the replica instead, which is the one mistake
/// this cannot make.
///
/// **It is read out of the message because the engine offers nothing else.** `turso::Error` has no
/// variant for a remote's answer: every refusal and every transport fault arrive as
/// `Error::Error(String)`, and the status the remote sent is inside it as `status=NNN`, which is
/// the same reading [`read_sync_refusal`] already makes of the same text. A release that reworded
/// it stops this matching, and a machine that stops matching keeps what it holds, which is the
/// direction a mistake here should fail in.
pub fn database_is_gone(error: &turso::Error) -> bool {
    matches!(status_and_body(&error.to_string()), Some((404, _)))
}

/// `status=NNN, body=...` as the sync engine spells a refused request, and nothing where the
/// message is not that shape.
fn status_and_body(text: &str) -> Option<(u16, &str)> {
    let start = text.find("status=")?;
    let rest = &text[start + "status=".len()..];
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    let status = digits.parse::<u16>().ok()?;
    let body = rest
        .find("body=")
        .map(|index| rest[index + "body=".len()..].trim())
        .unwrap_or("");

    Some((status, body))
}

#[cfg(test)]
mod tests {
    use super::{
        CREDENTIAL_NOT_ACCEPTED, account_refused, belongs_to_the_account, database_is_gone,
        no_authority, read_sync_refusal, turso_refused, unreachable,
    };
    use crate::error::{Error, RefusalReason};
    use serde_json::json;

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
        // seen live on 2026-09-11: a permission refusal spelled with the same word.
        assert!(!belongs_to_the_account(
            403,
            &json!({ "error": "BLOCKED: SQL write operations are forbidden (current session doesn't have write permission)" }).to_string()
        ));
    }

    /// Requirement 25's reading at the other place Turso answers: the sync engine's error, with
    /// the status and the body it carries. The account's, the credential's, and neither.
    #[test]
    fn a_replication_refusal_is_read_off_the_status_and_the_body_the_engine_carries() {
        let engine = |status: u16, body: &str| {
            turso::Error::Error(format!(
                "sync engine operation failed: database sync engine error: sql_execute_http:                  unexpected http response: status={status}, body={body}"
            ))
        };

        assert_eq!(
            read_sync_refusal(&engine(402, r#"{"error":"quota exceeded"}"#)),
            Some(Error::refused(
                RefusalReason::TursoAccountRefused,
                "quota exceeded"
            ))
        );
        assert_eq!(
            read_sync_refusal(&engine(
                403,
                r#"{"error":"databases BLOCKED: exceeded the plan's storage"}"#
            )),
            Some(Error::refused(
                RefusalReason::TursoAccountRefused,
                "databases BLOCKED: exceeded the plan's storage"
            ))
        );
        // seen live on 2026-09-12, after a rotation: the credential's, and what the shell
        // collects a fresh one on.
        assert_eq!(
            read_sync_refusal(&engine(
                401,
                r#"{"error":"Unauthorized: `unauthorized access attempt on database: invalid JWT token: role was invalidated after token was issued`"}"#
            )),
            Some(Error::Credential {
                message: CREDENTIAL_NOT_ACCEPTED.to_string()
            })
        );
        // seen live on 2026-09-11: a read-only credential's write, the credential's and not the
        // account's for all that it says BLOCKED.
        assert_eq!(
            read_sync_refusal(&engine(
                403,
                r#"{"error":"BLOCKED: SQL write operations are forbidden (current session doesn't have write permission)"}"#
            )),
            Some(Error::Credential {
                message: CREDENTIAL_NOT_ACCEPTED.to_string()
            })
        );
        assert_eq!(
            read_sync_refusal(&engine(500, r#"{"error":"internal"}"#)),
            None
        );
        assert_eq!(
            read_sync_refusal(&turso::Error::Error(
                "sync engine operation failed: connection refused".to_string()
            )),
            None
        );
    }

    /// Effort 828, requirement 18: **the one refusal that says the database is not there any
    /// more**, which is what tells a machine the owner deleted the organization. The three
    /// messages below are the engine's own, recorded from a pull against a scripted server in
    /// `organization/session/forget.rs`; what a deleted Turso database itself answers has not been
    /// run against a live account, and until it has, a status this does not recognise leaves the
    /// machine holding what it holds.
    #[test]
    fn a_database_that_is_not_there_is_told_from_a_credential_and_from_a_remote_that_answered_nothing()
     {
        let answered = |status: u16, body: &str| {
            turso::Error::Error(format!(
                "sync engine operation failed: database sync engine error: remote server returned \
                 an error: status={status}, body={body}"
            ))
        };

        assert!(database_is_gone(&answered(
            404,
            r#"{"error":"database not found"}"#
        )));
        assert!(!database_is_gone(&answered(
            401,
            r#"{"error":"Unauthorized: invalid JWT"}"#
        )));
        assert!(!database_is_gone(&answered(
            403,
            r#"{"error":"BLOCKED: SQL write operations are forbidden"}"#
        )));
        assert!(!database_is_gone(&answered(500, r#"{"error":"internal"}"#)));
        assert!(!database_is_gone(&turso::Error::Error(
            "sync engine operation failed: database sync engine error: http request failed: \
             client error (SendRequest)"
                .to_string()
        )));
    }

    #[test]
    fn each_failure_crosses_to_the_web_layer_as_a_fact_and_not_as_tursos_words() {
        let what = "create the workspace database";

        assert!(matches!(unreachable(what), Error::Network { .. }));
        assert!(matches!(
            turso_refused(what),
            Error::Refused {
                reason: crate::error::RefusalReason::TursoRefused,
                ..
            }
        ));
        assert!(matches!(
            account_refused(what),
            Error::Refused { reason: crate::error::RefusalReason::TursoAccountRefused, message } if message.contains("account")
        ));
    }

    /// **The words each failure crosses with, pinned as they reach the web layer** (effort 840,
    /// ticket 47): the code, the reason and the developer's description, exactly.
    #[test]
    fn each_failure_crosses_with_the_words_it_always_had() {
        let what = "create the workspace database";
        let crossing =
            |error: Error| serde_json::to_value(error).expect("an error did not serialise");

        assert_eq!(
            crossing(unreachable(what)),
            json!({
                "code": "network",
                "message": "could not create the workspace database just now. try again in a moment"
            })
        );
        assert_eq!(
            crossing(turso_refused(what)),
            json!({
                "code": "refused",
                "reason": "tursoRefused",
                "message": "could not create the workspace database. trying again will not help"
            })
        );
        assert_eq!(
            crossing(account_refused(what)),
            json!({
                "code": "refused",
                "reason": "tursoAccountRefused",
                "message": "could not create the workspace database: the organization's turso \
                            account needs attention before this can continue"
            })
        );
        assert_eq!(
            crossing(no_authority()),
            json!({
                "code": "refused",
                "reason": "tursoNotConnected",
                "message": "this machine holds no turso authority. grant the consent again to continue"
            })
        );
    }
}
