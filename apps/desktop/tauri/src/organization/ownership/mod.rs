//! the handover: the organization offered to another account, the offer withdrawn, and the offer
//! accepted on the offered account's own machine (effort 828, requirement 22).
//!
//! What is here is the commands. The acts they run are `role::offer_ownership`,
//! `role::withdraw_offer` and `role::accept_ownership`, beside the certificate reissue and the one
//! transaction a handover shares with every change of role.

mod command;

pub use command::*;
