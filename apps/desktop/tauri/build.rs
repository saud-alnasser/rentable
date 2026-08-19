use std::{
    env, fs,
    path::{Path, PathBuf},
};

fn main() {
    println!("cargo:rerun-if-env-changed=TAURI_UPDATER_PUBLIC_KEY");

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("missing manifest dir"));
    let workspace_env_path = manifest_dir.join("..").join(".env");

    println!("cargo:rerun-if-changed={}", workspace_env_path.display());

    if let Some(public_key) = env::var("TAURI_UPDATER_PUBLIC_KEY")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| read_env_value(&workspace_env_path, "TAURI_UPDATER_PUBLIC_KEY"))
    {
        println!("cargo:rustc-env=TAURI_UPDATER_PUBLIC_KEY={public_key}");
    }

    let migrations = shipped_migrations(&manifest_dir);

    mirror_migrations(&migrations, &manifest_dir.join("migrations"));
    write_workspace_schema_version(&migrations);

    tauri_build::build()
}

/// Where the workspace migrations actually live: `packages/workspace-migrations`.
///
/// **One copy, and this crate is not where it is.** The same SQL builds a local workspace here
/// and a hosted one in `apps/control-plane`, so it is a package both depend on rather than a
/// directory inside one of them. Reached by a path relative to this crate rather than through
/// `node_modules`, because a build script that needs `pnpm install` to have run is a build script
/// that fails on a fresh clone.
fn shipped_migrations(manifest_dir: &Path) -> PathBuf {
    let folder = manifest_dir
        .join("..")
        .join("..")
        .join("..")
        .join("packages")
        .join("workspace-migrations")
        .join("migrations");

    // Not `rerun-if-changed` on each file: a migration that is *added* changes the directory, and
    // naming the directory is what notices that. Naming the files would notice only edits to the
    // ones that already existed.
    println!("cargo:rerun-if-changed={}", folder.display());

    folder
}

/// Put the shipped `.sql` files where the Rust runner and Tauri's bundler expect them.
///
/// **`tauri/migrations/` is generated, and gitignored, and that is the whole reason this function
/// exists.** `database/migrations.rs` takes a directory and reads it at launch, Tauri copies one
/// into the installer as a resource, and the `#542` harness resolves it from `CARGO_MANIFEST_DIR`
/// — none of which could follow the migrations into a package without changing a harness that
/// acceptance criterion 12 requires to pass **unchanged**. So the package stays the one tracked
/// copy and this mirrors it, on every cargo build including the one `cargo test` performs.
///
/// **It mirrors rather than tops up**: a `.sql` file here that the package no longer has is
/// removed, so deleting a migration cannot leave a stale one to be applied.
fn mirror_migrations(from: &Path, to: &Path) {
    fs::create_dir_all(to)
        .unwrap_or_else(|error| panic!("cannot create {}: {error}", to.display()));

    let shipped: Vec<PathBuf> = sql_files(from);

    for stale in sql_files(to) {
        let name = stale.file_name().expect("a file with no name");

        if !shipped.iter().any(|file| file.file_name() == Some(name)) {
            fs::remove_file(&stale)
                .unwrap_or_else(|error| panic!("cannot remove {}: {error}", stale.display()));
        }
    }

    for file in shipped {
        let name = file.file_name().expect("a file with no name");
        let destination = to.join(name);
        let sql = fs::read(&file)
            .unwrap_or_else(|error| panic!("cannot read {}: {error}", file.display()));

        // Written only when it differs. An unconditional write changes the file's timestamp on
        // every build, which is what the runner's own directory read would then see as churn.
        if fs::read(&destination).ok().as_deref() != Some(sql.as_slice()) {
            fs::write(&destination, &sql)
                .unwrap_or_else(|error| panic!("cannot write {}: {error}", destination.display()));
        }
    }
}

fn sql_files(folder: &Path) -> Vec<PathBuf> {
    fs::read_dir(folder)
        .unwrap_or_else(|error| panic!("cannot read {}: {error}", folder.display()))
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|kind| kind == "sql"))
        .collect()
}

/// The workspace schema version this build ships, counted from the migrations it ships.
///
/// **A build produces it, and that is the requirement rather than a convenience.** The number goes
/// to the control plane with every request for a workspace token, and the control plane decides
/// from it whether to migrate a hosted workspace, to mint, or to refuse — so a number somebody
/// remembers to bump is a number that is wrong on the release where somebody forgot. Adding a
/// migration moves it, and nothing else can.
///
/// It is emitted as a Rust source file rather than an environment variable so the constant is a
/// literal the compiler sees: `env!` hands back a `&str`, and parsing one in a `const` context is
/// a hand-written parser to avoid a build step that is three lines.
///
/// **Counted, not parsed out of the highest filename.** The count is what
/// `apps/control-plane/src/workspace/migration.ts` derives its own version from, over the same
/// package, and the two numbers only mean the same thing if they are derived the same way.
fn write_workspace_schema_version(migrations: &Path) {
    let version = sql_files(migrations).len();
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("missing out dir"));

    fs::write(
        out_dir.join("workspace-schema-version.rs"),
        format!(
            "pub const WORKSPACE_SCHEMA_VERSION: u32 = {version};
"
        ),
    )
    .expect("cannot write the workspace schema version");
}

fn read_env_value(path: &PathBuf, key: &str) -> Option<String> {
    let contents = fs::read_to_string(path).ok()?;

    for line in contents.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let Some((name, value)) = trimmed.split_once('=') else {
            continue;
        };

        if name.trim() != key {
            continue;
        }

        let value = value.trim().trim_matches('"').trim_matches('\'');

        if value.is_empty() {
            return None;
        }

        return Some(value.to_string());
    }

    None
}
