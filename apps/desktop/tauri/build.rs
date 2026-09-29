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
    write_workspace_migrations(&manifest_dir.join("migrations"));

    let plugins = feature_plugins(&manifest_dir.join("src"));

    write_feature_plugins(&plugins);
    build_with(&plugins);
}

/// One of the application's own features, served as an inline plugin: the name it registers
/// under and the commands its handler answers to.
struct FeaturePlugin {
    /// the directory under `src/` that holds it, and so the Rust path to its commands.
    module: String,
    /// the name in its `Builder::new(..)`, the `<name>` of `plugin:<name>|<command>`.
    name: String,
    /// each command as the handler names it: a `super::` or `crate::` path from its `plugin.rs`.
    handled: Vec<String>,
    /// each command as it is invoked and allowed: its function name with `<module>_` taken off.
    commands: Vec<String>,
}

/// Every `src/<module>/plugin.rs`, read for its name and its handler.
///
/// **The command list is derived, not kept.** A plugin's commands are checked against the ACL by
/// exact name, and nothing in Tauri checks that list against the handler, so a command that is
/// handled but not listed is refused at runtime and nowhere earlier. Reading the list out of the
/// one `generate_handler!` each plugin has leaves no second list to forget. A command answers to
/// its function name with the feature's prefix taken off, through `#[tauri::command(rename)]`,
/// and the test in `guard/acl.rs` holds each rename to the name derived here.
///
/// The parse is strict rather than forgiving: an entry that is not a plain path (one behind a
/// `#[cfg]`, say, which would make the list differ between builds) fails the build and says why.
fn feature_plugins(source: &Path) -> Vec<FeaturePlugin> {
    // the directory itself, so that a plugin added in a new module is noticed.
    println!("cargo:rerun-if-changed={}", source.display());

    let mut plugins: Vec<FeaturePlugin> = fs::read_dir(source)
        .unwrap_or_else(|error| panic!("cannot read {}: {error}", source.display()))
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path().join("plugin.rs"))
        .filter(|path| path.is_file())
        .map(|path| {
            println!("cargo:rerun-if-changed={}", path.display());

            let module = path
                .parent()
                .and_then(|folder| folder.file_name())
                .and_then(|name| name.to_str())
                .expect("a plugin outside a named module")
                .to_string();
            let text = fs::read_to_string(&path)
                .unwrap_or_else(|error| panic!("cannot read {}: {error}", path.display()));

            feature_plugin(module, &text)
        })
        .collect();

    plugins.sort_by(|a, b| a.module.cmp(&b.module));
    plugins
}

fn feature_plugin(module: String, text: &str) -> FeaturePlugin {
    let file = format!("src/{module}/plugin.rs");

    let name = only_one(text, "Builder::new(\"", &file)
        .split('"')
        .next()
        .expect("a split yields at least one piece")
        .to_string();

    let handler = only_one(text, "generate_handler![", &file);
    let handler = &handler[..handler
        .find(']')
        .unwrap_or_else(|| panic!("{file}: its `generate_handler![` is not closed"))];

    let handled: Vec<String> = handler
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(|entry| {
            let plain = entry.split("::").all(|part| {
                !part.is_empty() && part.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
            });

            if !plain || !(entry.starts_with("super::") || entry.starts_with("crate::")) {
                panic!(
                    "{file}: `{entry}` in its handler is not a plain `super::` or `crate::` path, \
                     and the command list is read from the handler"
                );
            }

            entry.to_string()
        })
        .collect();

    let prefix = format!("{module}_");
    let commands = handled
        .iter()
        .map(|entry| {
            let function = entry.rsplit("::").next().expect("a path has a last part");

            function
                .strip_prefix(&prefix)
                .unwrap_or(function)
                .to_string()
        })
        .collect();

    FeaturePlugin {
        module,
        name,
        handled,
        commands,
    }
}

/// The text after the one occurrence of `marker` in a plugin's source.
fn only_one<'a>(text: &'a str, marker: &str, file: &str) -> &'a str {
    let mut found = text.match_indices(marker);

    let Some((at, _)) = found.next() else {
        panic!("{file}: no `{marker}` in a plugin's source");
    };

    if found.next().is_some() {
        panic!("{file}: more than one `{marker}`, where a plugin has one name and one handler");
    }

    &text[at + marker.len()..]
}

/// The derived lists, written for the test in `guard/acl.rs` to hold against the handlers.
///
/// `handled` spells each handler entry as the macro `#[tauri::command]` generates beside its
/// function, `__tauri_command_name_<fn>!()`, which is the very string the handler's `match`
/// compares an invoke against. So the test compares what the ACL allows with what the handler
/// answers, rather than two readings of the same text.
fn write_feature_plugins(plugins: &[FeaturePlugin]) {
    let entries: Vec<String> = plugins
        .iter()
        .map(|plugin| {
            let commands: Vec<String> = plugin
                .commands
                .iter()
                .map(|command| format!("{command:?}"))
                .collect();
            let handled: Vec<String> = plugin
                .handled
                .iter()
                .map(|entry| {
                    let entry = match entry.strip_prefix("super::") {
                        Some(rest) => format!("crate::{}::{rest}", plugin.module),
                        None => entry.clone(),
                    };
                    let (path, function) = entry.rsplit_once("::").expect("a path has a last part");

                    format!("{path}::__tauri_command_name_{function}!()")
                })
                .collect();

            format!(
                "    FeaturePlugin {{ module: {:?}, name: {:?}, commands: &[{}], handled: &[{}] }},",
                plugin.module,
                plugin.name,
                commands.join(", "),
                handled.join(", ")
            )
        })
        .collect();
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("missing out dir"));
    let source = format!(
        "pub const FEATURE_PLUGINS: &[FeaturePlugin] = &[\n{}\n];\n",
        entries.join("\n")
    );

    fs::write(out_dir.join("feature-plugins.rs"), source)
        .expect("cannot write the feature plugins");
}

/// `tauri_build::build()`, with each feature plugin registered so that its commands have
/// permissions: an `allow-<command>` for each, and a `default` allowing them all, which is what
/// `capabilities/default.json` grants as `"<name>:default"`.
fn build_with(plugins: &[FeaturePlugin]) {
    let mut attributes = tauri_build::Attributes::new();

    for plugin in plugins {
        // `commands` takes `&'static` data, which a build script that runs once and exits can
        // give it by leaking what it read.
        let commands: Vec<&'static str> = plugin
            .commands
            .iter()
            .map(|command| &*Box::leak(command.clone().into_boxed_str()))
            .collect();

        attributes = attributes.plugin(
            Box::leak(plugin.name.clone().into_boxed_str()),
            tauri_build::InlinedPlugin::new()
                .commands(Box::leak(commands.into_boxed_slice()))
                .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
        );
    }

    // what `tauri_build::build()` does with its default attributes, word for word.
    if let Err(error) = tauri_build::try_build(attributes) {
        let error = format!("{error:#}");
        println!("{error}");
        if error.starts_with("unknown field") {
            print!(
                "found an unknown configuration field. This usually means that you are using a CLI version that is newer than `tauri-build` and is incompatible. "
            );
            println!(
                "Please try updating the Rust crates by running `cargo update` in the Tauri app folder."
            );
        }
        std::process::exit(1);
    }
}

/// Where the workspace migrations actually live: `packages/workspace-migrations`.
///
/// **One copy, and this crate is not where it is.** The same SQL builds a local workspace here
/// and a hosted one over the wire, through `organization/lease/apply.rs` here, and the frontend's
/// test database is built from it too, so it is a package both depend on rather than a
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

/// Put the shipped `.sql` files where this crate's own tests expect them.
///
/// **`tauri/migrations/` is generated, and gitignored, and one reader is left.** It used to have
/// three: the Rust runner read it at launch, Tauri copied it into the installer as a resource,
/// and `database/version.rs`'s harness resolves it from `CARGO_MANIFEST_DIR`. The client applies
/// no migrations now and ships none, so the first two are gone and the harness is the reason this
/// mirror survives — acceptance criterion 12 requires those two tests to pass **unchanged**, and
/// they resolve the directory rather than the package. So the package stays the one tracked copy
/// and this mirrors it, on every cargo build including the one `cargo test` performs.
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
/// **A build produces it, and that is the requirement rather than a convenience.** The number is
/// compared with the version a workspace is recorded at on every open, and the comparison decides
/// whether to upgrade the workspace under a lease, to open it, or to refuse it as newer than this
/// build, so a number somebody remembers to bump is a number that is wrong on the release where
/// somebody forgot. Adding a migration moves it, and nothing else can.
///
/// It is emitted as a Rust source file rather than an environment variable so the constant is a
/// literal the compiler sees: `env!` hands back a `&str`, and parsing one in a `const` context is
/// a hand-written parser to avoid a build step that is three lines.
///
/// **Counted, not parsed out of the highest filename.** Every runner this package has had derived
/// its version the same way, so the version a workspace is recorded at means the same thing
/// whichever runner wrote it.
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

/// The shipped migrations, embedded in the binary in the order they apply.
///
/// **The desktop applies migrations again, and this is how the SQL reaches a machine.** A
/// workspace is created by a client now rather than by a service, so the client has to carry what
/// the service carried: every `.sql` file, in `drizzle-kit`'s numbered order, as text the compiler
/// sees. `include_str!` against the mirrored copy above, so the one tracked copy in the package is
/// still the only source and a build that did not re-run when a migration was added is caught by
/// the same directory read the version is counted from.
fn write_workspace_migrations(mirrored: &Path) {
    let mut files = sql_files(mirrored);

    // the same order both runners apply them in: a plain sort over names drizzle-kit numbers
    // from `0000`.
    files.sort();

    let entries: Vec<String> = files
        .iter()
        .map(|file| {
            let name = file
                .file_name()
                .and_then(|name| name.to_str())
                .expect("a migration with no name");
            let path = file
                .canonicalize()
                .unwrap_or_else(|error| panic!("cannot resolve {}: {error}", file.display()));

            // Windows canonicalises to a verbatim path, `\\?\C:\...`, which `include_str!` does
            // not take; the prefix is dropped and the rest is a path the macro reads.
            let path = path.to_string_lossy();
            let path = path.strip_prefix(r"\\?\").unwrap_or(&path);

            format!("    ({name:?}, include_str!({path:?})),")
        })
        .collect();
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("missing out dir"));
    let source = format!(
        "pub const WORKSPACE_MIGRATIONS: &[(&str, &str)] = &[\n{}\n];\n",
        entries.join("\n")
    );

    fs::write(out_dir.join("workspace-migrations.rs"), source)
        .expect("cannot write the workspace migrations");
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
