//! The Turso adapter: reaching Turso as the customer's own account rather than as ours.
//!
//! `consent.rs` is Turso's side of the authorization code flow: its endpoints, the client this
//! application registers, the scope set it asks a person to grant, and where the Platform API
//! token that comes back is kept. The protocol those are spent on is provider-agnostic and lives
//! in `oauth/`; Turso is the one authorization server the application asks, so the protocol sits
//! inside the adapter that drives it. `discovery.rs` turns a consented token into the
//! organization slug, and `platform.rs` is the Platform API that provisions and mints.
//!
//! **A module of its own, and it reaches none of the modules that call it.** It was `sync/turso/`
//! and `sync/oauth/` until effort 840, and everything that needed Turso reached into `sync`'s
//! internals for it. What this machine remembers about a consent is its record's, and stays with
//! the record: `sync::consented_organization`.

pub mod consent;

pub mod discovery;

pub mod oauth;

pub mod platform;
