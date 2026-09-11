//! an organization: its members, what each of them may do, and the credentials a
//! member's password unlocks.
//!
//! Two modules over bytes, and they are separate on purpose. The vault is the key
//! schedule and answers whether a password opens something. The authority chain
//! answers whether a row is telling the truth. Neither knows anything about rows,
//! about Turso, or about the organization it is for, and one module answering both
//! questions would let a reviewer check one and believe they had checked both.
//!
//! A third holds the rows. The store is the organization database as a replica on
//! this machine, its schema, and the queries over it; it seals nothing itself and
//! signs and verifies through the chain, so the two questions above still have one
//! answer each.

//! What follows the three is the work over them: the link a machine finds an
//! organization by, and the first run that creates one.

use serde::{Deserialize, Serialize};

pub mod authority;
mod command;
pub mod link;
pub mod session;
pub mod setup;
pub mod store;
pub mod vault;

pub use command::*;

/// One organization this machine has joined, as `remote-sync.json` keeps it.
///
/// The verifying key is base64url, as the join link spells it, and it is **the copy every
/// verification on this machine uses**: pinned from the link at join, never refreshed from the
/// database it judges.
#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct JoinedOrganization {
    pub id: String,
    /// what the person typed at creation, or what the invitation showed them. Shown on the
    /// sign-in screen; the sealed copy in the database is what every other machine reads.
    pub name: String,
    pub verifying_key: String,
    pub remote_url: String,
    /// this person's member row in that organization.
    pub member_id: String,
    /// their role there, as last read. A display fact: what a member may do is what their vault
    /// holds, never this.
    pub role: String,
    pub joined_at: i64,
}
