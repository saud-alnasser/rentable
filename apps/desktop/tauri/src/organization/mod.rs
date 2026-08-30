//! an organization: its members, what each of them may do, and the credentials a
//! member's password unlocks.
//!
//! The vault is the whole of this module today. It is the key schedule and knows
//! nothing about rows, about Turso, or about the organization it is for.

pub mod vault;
