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
//! without opening a vault, the machine link whoever keeps the accounts makes for a member whose
//! password is already set, and the forget that leaves nothing of it here. And one that runs once:
//! the owner's upgrade of an organization an earlier version made, through each change of format
//! in order.

pub mod authority;
mod command;
pub mod connect;
pub mod forget;
pub mod invite;
pub mod join;
pub mod link;
pub mod machine;
pub mod mark;
pub mod migrate;
pub mod migration;
pub mod password;
pub mod permission;
pub mod removal;
pub mod role;
pub mod session;
pub mod setup;
pub mod store;
pub mod transition;
pub mod upgrade;
pub mod vault;
pub mod workspace;

pub use command::*;

/// The one organization this machine holds, as this machine's record keeps it. Described with
/// the record (`machine`), which is what it is part of; named here, where the organization's own
/// code reads and writes it.
pub use crate::machine::HeldOrganization;
