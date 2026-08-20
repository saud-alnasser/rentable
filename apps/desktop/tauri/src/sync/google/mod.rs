//! signing in with Google.
//!
//! **What is left here is identity, and it is all that ever was not Drive's.** This was the
//! Drive provider area — the transport, the file operations, the manifest, conflict analysis,
//! retention and the metadata decoders — and Drive sync retired (decision 07). The OAuth half
//! survived it because sign-in is Google rather than Drive, which is the separation #543 made
//! before this deletion could be taken.

pub mod auth;
pub mod picture;
pub mod profile;

#[cfg(test)]
pub(super) mod test;
