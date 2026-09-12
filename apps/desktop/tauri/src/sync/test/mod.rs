//! scaffolding the tests that reach a remote share.
//!
//! A directory rather than a file, because what tests need in common grows and the alternative
//! is a filename that names two things. *It lived under `sync/google/` until the retirement of
//! Google sign-in, when the server it holds outlived the tests it was written for: every
//! organization test that scripts a Turso answer stands on it.*

pub(crate) mod server;
