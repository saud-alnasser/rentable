//! reaching Turso as the customer's own account rather than as ours.
//!
//! What is here is Turso's side of the authorization code flow: its endpoints, the client
//! this application registers, the scope set it asks a person to grant, and where the
//! Platform API token that comes back is kept. The protocol those are spent on is
//! provider-agnostic and lives in `sync/oauth/`, which `sync/google/` drives as well.
//!
//! Nothing here provisions anything. Creating a group, creating a database and minting a
//! credential are the Platform API's, and they are `platform.rs`'s once that exists.

pub mod consent;

pub mod discovery;

pub mod platform;
