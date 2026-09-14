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
//! organization by, the first run that creates one, the connect that records one on a machine
//! without opening a vault, and the forget that leaves nothing of it here.

use serde::{Deserialize, Serialize};

pub mod authority;
mod command;
pub mod connect;
pub mod forget;
pub mod invite;
pub mod join;
pub mod link;
pub mod migrate;
pub mod migration;
pub mod password;
pub mod permission;
pub mod removal;
pub mod role;
pub mod session;
pub mod setup;
pub mod store;
pub mod vault;
pub mod workspace;

pub use command::*;

/// The one organization this machine holds, as `remote-sync.json` keeps it.
///
/// **One or none, and the type says so** (effort 824, requirement 17): the record used to be a
/// list of every organization the machine had joined, and the wall listed them. A machine now
/// holds one, connected by the organization's link before anybody has signed in, and forgets it
/// whole on a disconnect (`forget.rs`).
///
/// The verifying key is base64url, as the link spells it, and it is **the copy every
/// verification on this machine uses**: pinned from the link at connect, never refreshed from the
/// database it judges.
#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct HeldOrganization {
    pub id: String,
    /// what the person typed at creation, or what the link carried. Shown on the wall; the
    /// sealed copy in the database is what every other machine reads.
    pub name: String,
    pub verifying_key: String,
    pub remote_url: String,
    /// this person's member row in the organization, once a sign-in has found it. `None` on a
    /// machine that connected by link and has not signed in yet; a sign-out keeps it.
    pub member_id: Option<String>,
    /// their role there, as last read. A display fact: what a member may do is what their vault
    /// holds, never this. `None` with `member_id`.
    pub role: Option<String>,
    /// when this machine recorded the organization, whether by creating it, connecting by link,
    /// or the join and restore paths effort 824 retires.
    pub joined_at: i64,
}
