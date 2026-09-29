//! The workspace replica's commands, served as the `sync` plugin: what this machine reads of its
//! standing, and the push on the way out. The record they read is `machine`'s; the replication,
//! which reaches into the organization for where the member stands, is `organization`'s command.
//!
//! Each command keeps its crate-unique Rust name and answers to the name without the feature
//! prefix, since the plugin supplies it: `sync_state_get` is invoked as `plugin:sync|state_get`.

pub mod command;
mod plugin;
#[cfg(test)]
pub(crate) mod test;

pub use plugin::plugin;
