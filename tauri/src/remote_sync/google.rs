//! the Google Drive provider area. The Drive port (#114-#118) lands here: each file
//! names the destination for the concern it will absorb.

pub mod auth;
pub mod conflict;
pub mod files;
pub mod manifest;
pub mod metadata;
pub mod retention;
pub mod transport;

#[cfg(test)]
mod test_server;
#[cfg(test)]
mod tests;
