//! Nothing outside `clock/` reads the system time (effort 840, requirement and criterion 12).
//!
//! A read is `SystemTime::now`, however it is reached: `std::time::SystemTime::now()` inline, or
//! `SystemTime::now()` under a `use`. Production sources are what `cycle.rs` reads as production:
//! every file under `src/` but test code (a `#[cfg(test)]` item, or a `test/` or `tests/`
//! directory) and this directory, which ships nothing. `Instant::now` is a monotonic timer that
//! says how long, not when, and is not a read of the time.

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::super::cycle::tests::{Token, is_test_file, lex, read_sources, without_tests};

    /// Every place in `sources` that reads the system time outside `clock/`, as `path:line`.
    fn reads(sources: &[(String, String)]) -> Vec<String> {
        let mut found = Vec::new();

        for (path, text) in sources {
            if path.starts_with("clock/") || path.starts_with("guard/") || is_test_file(path) {
                continue;
            }

            let tokens = without_tests(lex(text));

            for window in tokens.windows(4) {
                let spelled = matches!(
                    window,
                    [
                        (Token::Ident(ty), _),
                        (Token::Punct(':'), _),
                        (Token::Punct(':'), _),
                        (Token::Ident(call), _),
                    ] if ty == "SystemTime" && call == "now"
                );

                if spelled {
                    found.push(format!("{path}:{}", window[0].1));
                }
            }
        }

        found
    }

    /// **Criterion 12.** No production source outside `clock/` names `SystemTime::now`.
    #[test]
    fn nothing_outside_the_clock_reads_the_system_time() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut sources = Vec::new();
        read_sources(&root, &root, &mut sources);

        assert!(
            sources.iter().any(|(path, _)| path == "clock/system.rs"),
            "src/ was not read: {} files",
            sources.len()
        );

        let found = reads(&sources);

        assert!(
            found.is_empty(),
            "the system time is read outside clock/; take the clock instead:\n    {}",
            found.join("\n    ")
        );
    }

    /// And the check itself, on sources made up here: a read inline and under a `use` is found,
    /// and nothing is found in `clock/`, a test module, a `test/` directory, a comment or a string.
    #[test]
    fn the_check_finds_a_read_wherever_it_is_spelled() {
        let file = |path: &str, text: &str| (path.to_string(), text.to_string());
        let sources = vec![
            file(
                "a.rs",
                "fn f() -> u128 {\n    std::time::SystemTime::now().elapsed().unwrap().as_millis()\n}\n",
            ),
            file(
                "b/mod.rs",
                "use std::time::SystemTime;\n\nfn g() {\n    let _ = SystemTime::now();\n}\n",
            ),
            file(
                "clock/system.rs",
                "fn now() {\n    let _ = SystemTime::now();\n}\n",
            ),
            file(
                "c.rs",
                "// SystemTime::now\nconst S: &str = \"SystemTime::now\";\nfn h(t: SystemTime) {}\n\
                 #[cfg(test)]\nmod tests {\n    fn t() {\n        let _ = SystemTime::now();\n    }\n}\n",
            ),
            file(
                "c/test/fixture.rs",
                "fn t() {\n    let _ = SystemTime::now();\n}\n",
            ),
            file(
                "d.rs",
                "fn i() {\n    let _ = std::time::Instant::now();\n}\n",
            ),
        ];

        assert_eq!(reads(&sources), vec!["a.rs:2", "b/mod.rs:4"]);
    }
}
