use std::{env, fs, path::PathBuf};

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

    tauri_build::build()
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
