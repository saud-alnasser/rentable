//! Holds every file and directory name under `src/` to `rules/module-layout` (effort 840,
//! requirement and criterion 14). The rule is the authority; this module is its mechanical half.
//!
//! What it checks is what the rule states and a reader of names alone can decide:
//!
//! - a name is one word: lowercase letters and digits, no underscore (*A Rust name is one word*);
//! - no module is named `utils` or `common` (the table of names that are not available);
//! - no module name is a plural, `tests` aside (the same table). In Rust a file is a module as
//!   much as a directory is, so a file is held to it too: `database/commands.rs` is the case the
//!   spec names;
//! - a directory is rooted by `mod.rs`, and no `<x>.rs` sits beside `<x>/`
//!   (*A Rust directory is rooted by `mod.rs`*).
//!
//! **The baseline only shrinks.** Today's offenders are `naming.baseline.txt`, sorted, one line each.
//! An offender that is not in it fails, and so does a line in it that no longer occurs, so a
//! rename deletes its line in the same commit and a new offender cannot be waved through.

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::fs;
    use std::path::{Path, PathBuf};

    /// The file names Rust itself fixes: a crate root, a binary root, a directory's root.
    const ROOTS: [&str; 3] = ["lib", "main", "mod"];
    /// The names the rule's table forbids, as a whole name or as one word of one.
    const BANNED: [&str; 2] = ["utils", "common"];

    fn source_root() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("src")
    }

    fn one_word(name: &str) -> bool {
        !name.is_empty()
            && name
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
    }

    fn banned(name: &str) -> bool {
        name.split(['_', '-']).any(|word| BANNED.contains(&word))
    }

    /// A word read as a plural by its ending. `-ss`, `-us` and `-is` end singulars (`progress`,
    /// `status`, `analysis`), so they are not counted.
    fn plural(name: &str) -> bool {
        name != "tests"
            && name.ends_with('s')
            && !["ss", "us", "is"]
                .iter()
                .any(|ending| name.ends_with(ending))
    }

    fn offences(root: &Path, directory: &Path, found: &mut BTreeSet<String>) {
        let label = |path: &Path| {
            path.strip_prefix(root)
                .expect("a walked path is under the root")
                .to_string_lossy()
                .replace('\\', "/")
        };

        let mut entries: Vec<_> = fs::read_dir(directory)
            .expect("the source directory is readable")
            .map(|entry| entry.expect("a directory entry is readable").path())
            .collect();
        entries.sort();

        for path in entries {
            let name = path
                .file_name()
                .expect("an entry has a name")
                .to_string_lossy()
                .into_owned();

            if path.is_dir() {
                let at = label(&path);
                if !one_word(&name) {
                    found.insert(format!("{at}/: not one word"));
                }
                if banned(&name) {
                    found.insert(format!("{at}/: banned name"));
                }
                if plural(&name) {
                    found.insert(format!("{at}/: plural"));
                }
                if !path.join("mod.rs").is_file() {
                    found.insert(format!("{at}/: no mod.rs"));
                }
                if path.with_extension("rs").is_file() {
                    found.insert(format!("{at}.rs: beside {at}/"));
                }
                offences(root, &path, found);
                continue;
            }

            let Some(stem) = name.strip_suffix(".rs") else {
                continue;
            };
            if ROOTS.contains(&stem) {
                continue;
            }
            let at = label(&path);
            if !one_word(stem) {
                found.insert(format!("{at}: not one word"));
            }
            if banned(stem) {
                found.insert(format!("{at}: banned name"));
            }
            if plural(stem) {
                found.insert(format!("{at}: plural"));
            }
        }
    }

    fn found() -> BTreeSet<String> {
        let root = source_root();
        let mut found = BTreeSet::new();
        offences(&root, &root, &mut found);
        found
    }

    fn baseline() -> Vec<String> {
        include_str!("naming.baseline.txt")
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(str::to_string)
            .collect()
    }

    #[test]
    fn the_baseline_is_sorted_and_has_no_repeats() {
        let lines = baseline();
        let sorted: Vec<_> = lines
            .iter()
            .cloned()
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        assert_eq!(
            lines, sorted,
            "naming.baseline.txt must be sorted, one line per offence"
        );
    }

    #[test]
    fn every_name_follows_the_module_layout_rule() {
        let found = found();
        let baseline: BTreeSet<String> = baseline().into_iter().collect();

        let new: Vec<_> = found.difference(&baseline).collect();
        let gone: Vec<_> = baseline.difference(&found).collect();

        assert!(
            new.is_empty() && gone.is_empty(),
            "names under tauri/src/ differ from src/guard/naming.baseline.txt\n\
             new offences, rename them (rules/module-layout): {new:#?}\n\
             no longer occurring, delete these lines: {gone:#?}"
        );
    }

    #[test]
    fn the_checks_read_names_as_the_rule_does() {
        assert!(!one_word("helper_util"));
        assert!(one_word("server"));
        assert!(banned("utils") && banned("chart_common") && !banned("commonplace"));
        assert!(plural("commands") && !plural("tests") && !plural("progress") && !plural("status"));
    }
}
