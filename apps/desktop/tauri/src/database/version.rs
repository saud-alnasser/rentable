//! The workspace schema version this build was compiled against.
//!
//! **One number, and the build produces it**: `build.rs` counts the migrations in
//! `tauri/migrations/` and writes the constant below, so adding a migration moves it and nothing
//! else can. A version somebody remembers to bump is a version that is wrong on the release
//! where somebody forgot.
//!
//! **Nothing on this side applies a migration**: a workspace's schema is applied to its database
//! over the wire by `organization/migrate.rs`, from the files `build.rs` embeds, and arrives at a
//! replica as replicated pages. That module counts its own shipped version from what it embeds,
//! and its tests hold that count equal to this one, so the two ways of counting the directory
//! cannot drift apart unnoticed.

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
    /// was added, which is silent, and which would have the build claim a schema it was not
    /// built against.
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
    /// would also produce, and a build claiming zero would refuse every workspace as newer than
    /// itself.
    #[test]
    fn the_version_is_not_zero() {
        assert!(WORKSPACE_SCHEMA_VERSION > 0);
    }
}
