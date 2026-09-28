//! The workspace replica's commands: what this machine reads of its standing, and the push on the
//! way out. The record they read is `machine`'s; the replication, which reaches into the
//! organization for where the member stands, is `organization`'s command.

mod command;
#[cfg(test)]
pub(crate) mod test;

pub use command::*;
