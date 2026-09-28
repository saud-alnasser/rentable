//! a member: the vault their password seals (`vault.rs`), the password they change
//! (`password.rs`), their removal and the organization's (`removal.rs`), and the commands on a
//! member's row (`command.rs`).
//!
//! The account a member is made as, and the link that admits them, are `invitation/`'s; the role
//! and the overrides that decide what they may do are `role/`'s.

mod command;
pub mod password;
pub mod removal;
pub mod vault;

pub use command::*;
