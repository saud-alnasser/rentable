//! One error type, and one scratch directory for tests (effort 840, requirement and criterion 13).
//!
//! Every fallible path answers `error::Error`. So no `Result` anywhere under `src/`, tests
//! included, carries a `String` as its error; and no production source outside `error.rs` declares
//! an enum named for an error or a refusal, implements `std::error::Error`, or implements anything
//! for `Error`, which is how a side vocabulary converted itself (`PlatformError` did). Production
//! is what `cycle.rs` reads as production. And a test makes a directory of its own through
//! `test::scratch` alone: nothing else under `src/` names `temp_dir`. Nothing it forbids occurs, so
//! it keeps no baseline.

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::super::cycle::tests::{Token, is_test_file, lex, read_sources, without_tests};

    fn ident(tokens: &[(Token, usize)], at: usize) -> Option<&str> {
        match tokens.get(at) {
            Some((Token::Ident(word), _)) => Some(word),
            _ => None,
        }
    }

    fn punct(tokens: &[(Token, usize)], at: usize, c: char) -> bool {
        matches!(tokens.get(at), Some((Token::Punct(p), _)) if *p == c)
    }

    /// Whether the tokens `from..to` spell `String`, alone or at the end of a path
    /// (`std::string::String`).
    fn spells_string(tokens: &[(Token, usize)], from: usize, to: usize) -> bool {
        to > from
            && ident(tokens, to - 1) == Some("String")
            && tokens[from..to - 1]
                .iter()
                .all(|(token, _)| matches!(token, Token::Ident(_) | Token::Punct(':')))
    }

    /// Whether the `Result` at `at` carries a `String` as its error: its last argument at the top
    /// of its angle brackets is `String`. The `>` of a `->` inside them closes nothing.
    fn carries_a_string(tokens: &[(Token, usize)], at: usize) -> bool {
        if ident(tokens, at) != Some("Result") || !punct(tokens, at + 1, '<') {
            return false;
        }

        let mut depth = 0;
        let mut last = at + 2;

        for index in at + 1..tokens.len() {
            match &tokens[index].0 {
                Token::Punct('<') => depth += 1,
                Token::Punct('>') if !punct(tokens, index.wrapping_sub(1), '-') => {
                    depth -= 1;

                    if depth == 0 {
                        return spells_string(tokens, last, index);
                    }
                }
                Token::Punct(',') if depth == 1 => last = index + 1,
                _ => {}
            }
        }

        false
    }

    /// What `sources` breaks of the module comment, as `path:line: what`.
    fn offences(sources: &[(String, String)]) -> Vec<String> {
        let mut found = Vec::new();

        for (path, text) in sources {
            if path.starts_with("guard/") {
                continue;
            }

            let everything = lex(text);

            for at in 0..everything.len() {
                let line = everything[at].1;

                if carries_a_string(&everything, at) {
                    found.push(format!("{path}:{line}: a Result that carries a String"));
                }

                if ident(&everything, at) == Some("temp_dir") && path != "test/mod.rs" {
                    found.push(format!(
                        "{path}:{line}: a temporary directory not from test::scratch"
                    ));
                }
            }

            if path == "error.rs" || is_test_file(path) {
                continue;
            }

            let shipped = without_tests(everything);

            for at in 0..shipped.len() {
                let line = shipped[at].1;

                if ident(&shipped, at) == Some("enum")
                    && let Some(name) = ident(&shipped, at + 1)
                    && (name.ends_with("Error") || name.ends_with("Refusal"))
                {
                    found.push(format!(
                        "{path}:{line}: an error enum beside error::Error: {name}"
                    ));
                }

                // `for Error {` or `for crate::error::Error {`: an impl for the one type
                let for_error = ident(&shipped, at) == Some("for")
                    && ((ident(&shipped, at + 1) == Some("Error") && punct(&shipped, at + 2, '{'))
                        || (ident(&shipped, at + 1) == Some("crate")
                            && ident(&shipped, at + 4) == Some("error")
                            && ident(&shipped, at + 7) == Some("Error")
                            && punct(&shipped, at + 8, '{')));

                if for_error {
                    found.push(format!("{path}:{line}: an impl for Error outside error.rs"));
                }

                // `impl Error for` or `impl std::error::Error for`: an error type of its own
                let implements_error = ident(&shipped, at) == Some("Error")
                    && ident(&shipped, at + 1) == Some("for")
                    && (ident(&shipped, at.wrapping_sub(1)) == Some("impl")
                        || (punct(&shipped, at.wrapping_sub(1), ':')
                            && ident(&shipped, at.wrapping_sub(3)) == Some("error")));

                if implements_error {
                    found.push(format!("{path}:{line}: an error type beside error::Error"));
                }
            }
        }

        found
    }

    /// **Criterion 13.** One error type and one scratch directory, across `src/`.
    #[test]
    fn the_crate_has_one_error_type_and_one_scratch_directory() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut sources = Vec::new();
        read_sources(&root, &root, &mut sources);

        assert!(
            sources.iter().any(|(path, _)| path == "error.rs"),
            "src/ was not read: {} files",
            sources.len()
        );

        let found = offences(&sources);

        assert!(
            found.is_empty(),
            "answer error::Error, and make a test's directory with test::scratch:\n    {}",
            found.join("\n    ")
        );
    }

    /// And the check itself, on sources made up here: each offence is found wherever it is
    /// spelled, and nothing is found in `error.rs`, in a comment or a string, in a `Result` whose
    /// error is not a `String`, or, for the enum and impl checks, in test code.
    #[test]
    fn the_check_finds_each_offence_wherever_it_is_spelled() {
        let file = |path: &str, text: &str| (path.to_string(), text.to_string());
        let sources = vec![
            file(
                "a.rs",
                "fn f() -> Result<(), String> {\n    Ok(())\n}\n\
                 type Answer = Result<Box<dyn Fn() -> u8>, std::string::String>;\n",
            ),
            file(
                "b.rs",
                "pub enum PlatformError {\n    Refused,\n}\n\
                 enum Refusal {\n    Lapsed,\n}\n\
                 impl From<PlatformError> for Error {\n    fn from(_: PlatformError) -> Self { todo!() }\n}\n\
                 impl std::error::Error for Hangup {}\n",
            ),
            file(
                "c.rs",
                "impl From<u8> for crate::error::Error {\n}\n\
                 fn g() {\n    let _ = std::env::temp_dir();\n}\n",
            ),
            file(
                "error.rs",
                "pub enum Error {}\nimpl From<std::io::Error> for Error {}\n\
                 impl std::error::Error for Error {}\n",
            ),
            file(
                "d.rs",
                "// Result<(), String>\nconst S: &str = \"enum SideError\";\n\
                 fn h() -> Result<String, Error> {\n    todo!()\n}\n\
                 #[cfg(test)]\nmod tests {\n    enum TestError {}\n    fn t() -> Result<(), String> {\n        Ok(())\n    }\n}\n",
            ),
            file("e/test/server.rs", "impl std::error::Error for Hangup {}\n"),
            file(
                "test/mod.rs",
                "fn scratch() {\n    let _ = std::env::temp_dir();\n}\n",
            ),
        ];

        assert_eq!(
            offences(&sources),
            vec![
                "a.rs:1: a Result that carries a String",
                "a.rs:4: a Result that carries a String",
                "b.rs:1: an error enum beside error::Error: PlatformError",
                "b.rs:4: an error enum beside error::Error: Refusal",
                "b.rs:7: an impl for Error outside error.rs",
                "b.rs:10: an error type beside error::Error",
                "c.rs:4: a temporary directory not from test::scratch",
                "c.rs:1: an impl for Error outside error.rs",
                "d.rs:9: a Result that carries a String",
            ]
        );
    }
}
