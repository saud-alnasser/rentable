//! scaffolding the tests that reach a remote share.
//!
//! A directory rather than a file, because what tests need in common grows and the alternative
//! is a filename that names two things. Every organization test that scripts a Turso answer
//! stands on the server it holds.

pub(crate) mod pipeline;
pub(crate) mod server;
