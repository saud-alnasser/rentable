//! the authorization code flow, with no authorization server in it.
//!
//! What is here is the protocol: RFC 7636's proof key, RFC 6749's authorization request and
//! token grant, and the loopback address a browser hands a code back on. What is not here is
//! any endpoint, client registration, scope or credential store, because those belong to
//! whichever server is being asked. `sync/turso/consent.rs` is the caller and holds Turso's.

pub mod authorization;
pub mod loopback;
pub mod pkce;
pub mod token;

use serde::{Deserialize, Serialize};

/// How one authorization server is reached.
///
/// It sits at the root rather than inside any of the modules above because more than one reads
/// it: the authorization request is built from the endpoint and the scopes, and the token grant
/// is sent to the endpoint with the client secret this names.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthConfig {
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub authorize_endpoint: String,
    pub token_endpoint: String,
    pub scopes: Vec<String>,
}
