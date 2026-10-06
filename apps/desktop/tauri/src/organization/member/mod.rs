//! a member: the vault their password seals (`vault.rs`), the password they change
//! (`password.rs`), the lock they start under and its unlock (`lock.rs`), their removal and the
//! organization's (`removal.rs`), and the commands on a member's row (`command.rs`).
//!
//! The account a member is made as, and the link that admits them, are `invitation/`'s; the role
//! and the overrides that decide what they may do are `role/`'s.

mod command;
pub mod lock;
pub mod password;
pub mod removal;
pub mod vault;

pub use command::*;
