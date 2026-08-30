//! an organization: its members, what each of them may do, and the credentials a
//! member's password unlocks.
//!
//! Two modules, and they are separate on purpose. The vault is the key schedule
//! and answers whether a password opens something. The authority chain answers
//! whether a row is telling the truth. Neither knows anything about rows, about
//! Turso, or about the organization it is for, and one module answering both
//! questions would let a reviewer check one and believe they had checked both.

pub mod authority;
pub mod vault;
