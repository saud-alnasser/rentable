//! The workspace schema version this build was compiled against.
//!
//! **One number, and the build produces it**: `build.rs` counts the migrations in
//! `tauri/migrations/` and writes the constant below, so adding a migration moves it and nothing
//! else can. A version somebody remembers to bump is a version that is wrong on the release
//! where somebody forgot, and this one is sent to a service that decides from it whether to
//! migrate a hosted workspace database, to mint a token, or to refuse.
//!
//! **It says nothing about a local workspace**, which is migrated exactly as it always has been —
//! `super::migrations` reads the same directory at launch and applies whatever the database has
//! not had. Decision 06 moved nothing there. What this number is for is the other mode: a hosted
//! workspace's schema is the control-plane API's to own, and the client's part of that bargain is
//! saying which schema it was built against when it asks for a token.
//!
//! Where it is sent is the request for a workspace token, which is a later ticket's — this is the
//! number that request carries, and it is derived here because the derivation is what had to be
//! settled rather than the call.

include!(concat!(env!("OUT_DIR"), "/workspace-schema-version.rs"));

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use super::WORKSPACE_SCHEMA_VERSION;

    /// The migration directory the application ships, resolved from the crate root rather than
    /// from the working directory — `pnpm test:rust` runs cargo from `apps/desktop`.
    fn shipped_migrations() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations")
    }

    /// The constant against the directory it was counted from.
    ///
    /// It is not a tautology dressed as a test: the constant is written at build time and read at
    /// compile time, so the failure this catches is a build that did not re-run when a migration
    /// was added — which is silent, and which would have the application tell the control plane it
    /// was built against a schema it was not.
    #[test]
    fn the_version_is_the_count_of_migrations_shipped() {
        let shipped = fs::read_dir(shipped_migrations())
            .expect("the migrations directory is missing")
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().extension().is_some_and(|kind| kind == "sql"))
            .count();

        assert_eq!(WORKSPACE_SCHEMA_VERSION as usize, shipped);
    }

    /// Zero would mean *no migrations*, which is what a build that could not read the directory
    /// would also produce — and a client claiming zero is a client the control plane would try to
    /// serve an empty schema.
    #[test]
    fn the_version_is_not_zero() {
        assert!(WORKSPACE_SCHEMA_VERSION > 0);
    }
}
