//! The crate's top-level modules as a graph: which reaches which, read from the source.
//!
//! Effort 840, requirements 5, 11 and 15. An edge is a `crate::<module>` path in one top-level
//! module naming another, whether in a `use` or inline; `lib.rs` is the composition root and not a
//! module of the graph, `main.rs` is another crate, and test code (a `#[cfg(test)]` item, or a
//! `test/` or `tests/` directory) is left out. The graph must hold no cycle and break none of
//! `RULES`, except where `cycle.baseline.txt` lists the violation; the baseline only shrinks,
//! because a line that no longer occurs fails as well.

#[cfg(test)]
pub(in crate::guard) mod tests {
    use std::collections::{BTreeMap, BTreeSet, VecDeque};
    use std::path::Path;

    /// A dependency the crate forbids, whether or not it would be a cycle.
    enum Rule {
        /// `from` names nothing of `to`.
        Never {
            from: &'static str,
            to: &'static str,
        },
        /// `from` reaches `to` only through what `to` itself exposes, never through one of `to`'s
        /// own modules: `crate::sync::RemoteSyncStore`, not `crate::sync::store::...`.
        Surface {
            from: &'static str,
            to: &'static str,
        },
    }

    /// Requirement 11 and criterion 11: `sync` imports nothing from `organization`, and
    /// `organization` nothing from `sync`'s internals.
    ///
    /// Requirement 15 adds a rule here once `upgrade/` exists: nothing names `upgrade` but its
    /// callers (`startup`, and `organization` for the session). It needs a third variant, the
    /// callers a module admits, and it arrives with the module rather than before it.
    const RULES: &[Rule] = &[
        Rule::Never {
            from: "sync",
            to: "organization",
        },
        Rule::Surface {
            from: "organization",
            to: "sync",
        },
    ];

    #[derive(Debug, Clone, PartialEq)]
    pub(in crate::guard) enum Token {
        Ident(String),
        Punct(char),
    }

    fn is_word(c: char) -> bool {
        c.is_alphanumeric() || c == '_'
    }

    /// The identifiers and punctuation of a Rust source file, each with its line. Comments,
    /// string, character and number literals and lifetimes are dropped, so a path written in a
    /// doc comment or a message is not read as a dependency.
    pub(in crate::guard) fn lex(source: &str) -> Vec<(Token, usize)> {
        let chars: Vec<char> = source.chars().collect();
        let mut tokens = Vec::new();
        let mut line = 1;
        let mut at = 0;

        // past a quoted body whose opening quote is behind `at`, counting lines; `hashes` closes
        // a raw string, which has no escapes.
        let skip_quoted = |at: &mut usize, line: &mut usize, hashes: Option<usize>| {
            while *at < chars.len() {
                let c = chars[*at];
                *at += 1;
                match (c, hashes) {
                    ('\n', _) => *line += 1,
                    ('\\', None) => {
                        if chars.get(*at) == Some(&'\n') {
                            *line += 1;
                        }
                        *at += 1;
                    }
                    ('"', None) => return,
                    ('"', Some(count))
                        if (0..count).all(|offset| chars.get(*at + offset) == Some(&'#')) =>
                    {
                        *at += count;
                        return;
                    }
                    _ => {}
                }
            }
        };

        while at < chars.len() {
            let c = chars[at];
            let next = chars.get(at + 1).copied();

            if c == '\n' {
                line += 1;
                at += 1;
            } else if c.is_whitespace() {
                at += 1;
            } else if c == '/' && next == Some('/') {
                while at < chars.len() && chars[at] != '\n' {
                    at += 1;
                }
            } else if c == '/' && next == Some('*') {
                let mut depth = 0;
                while at < chars.len() {
                    if chars[at] == '/' && chars.get(at + 1) == Some(&'*') {
                        depth += 1;
                        at += 2;
                    } else if chars[at] == '*' && chars.get(at + 1) == Some(&'/') {
                        depth -= 1;
                        at += 2;
                        if depth == 0 {
                            break;
                        }
                    } else {
                        if chars[at] == '\n' {
                            line += 1;
                        }
                        at += 1;
                    }
                }
            } else if c == '"' {
                at += 1;
                skip_quoted(&mut at, &mut line, None);
            } else if c == '\'' {
                if next == Some('\\') {
                    at += 2;
                    while at < chars.len() && chars[at] != '\'' {
                        at += 1;
                    }
                    at += 1;
                } else if chars.get(at + 2) == Some(&'\'') {
                    at += 3;
                } else {
                    // a lifetime or a label
                    at += 1;
                    while at < chars.len() && is_word(chars[at]) {
                        at += 1;
                    }
                }
            } else if c.is_ascii_digit() {
                while at < chars.len() && is_word(chars[at]) {
                    at += 1;
                }
            } else if is_word(c) {
                let start = at;
                while at < chars.len() && is_word(chars[at]) {
                    at += 1;
                }
                let word: String = chars[start..at].iter().collect();

                match (word.as_str(), chars.get(at).copied()) {
                    ("b" | "c", Some('"')) => {
                        at += 1;
                        skip_quoted(&mut at, &mut line, None);
                    }
                    ("b", Some('\'')) => {
                        at += 1;
                        if chars.get(at) == Some(&'\\') {
                            at += 1;
                        }
                        at += 1;
                        while at < chars.len() && chars[at] != '\'' {
                            at += 1;
                        }
                        at += 1;
                    }
                    ("r" | "br" | "cr", Some('"' | '#')) => {
                        let mut hashes = 0;
                        while chars.get(at + hashes) == Some(&'#') {
                            hashes += 1;
                        }
                        if chars.get(at + hashes) == Some(&'"') {
                            at += hashes + 1;
                            skip_quoted(&mut at, &mut line, Some(hashes));
                        } else {
                            // a raw identifier, `r#type`
                            at += hashes;
                            let start = at;
                            while at < chars.len() && is_word(chars[at]) {
                                at += 1;
                            }
                            tokens.push((Token::Ident(chars[start..at].iter().collect()), line));
                        }
                    }
                    _ => tokens.push((Token::Ident(word), line)),
                }
            } else {
                tokens.push((Token::Punct(c), line));
                at += 1;
            }
        }

        tokens
    }

    fn is_ident(token: Option<&(Token, usize)>, word: &str) -> bool {
        matches!(token, Some((Token::Ident(name), _)) if name == word)
    }

    fn is_punct(token: Option<&(Token, usize)>, punct: char) -> bool {
        matches!(token, Some((Token::Punct(c), _)) if *c == punct)
    }

    /// The tokens with every `#[cfg(test)]` item taken out: the attribute and the item under it,
    /// up to its closing brace or its semicolon.
    pub(in crate::guard) fn without_tests(tokens: Vec<(Token, usize)>) -> Vec<(Token, usize)> {
        let attribute = [
            Token::Punct('#'),
            Token::Punct('['),
            Token::Ident("cfg".to_string()),
            Token::Punct('('),
            Token::Ident("test".to_string()),
            Token::Punct(')'),
            Token::Punct(']'),
        ];
        let starts_at = |at: usize| {
            attribute.iter().enumerate().all(|(offset, piece)| {
                tokens.get(at + offset).map(|(token, _)| token) == Some(piece)
            })
        };

        let mut kept = Vec::new();
        let mut at = 0;

        while at < tokens.len() {
            if !starts_at(at) {
                kept.push(tokens[at].clone());
                at += 1;
                continue;
            }

            at += attribute.len();
            let mut depth = 0usize;

            while let Some((token, _)) = tokens.get(at) {
                at += 1;
                match token {
                    Token::Punct('(' | '[' | '{') => depth += 1,
                    Token::Punct(')' | ']') => depth = depth.saturating_sub(1),
                    Token::Punct('}') => {
                        depth = depth.saturating_sub(1);
                        if depth == 0 {
                            break;
                        }
                    }
                    Token::Punct(';') if depth == 0 => break,
                    _ => {}
                }
            }
        }

        kept
    }

    /// Every path a `use` tree or an inline path spells from `at`, each under `prefix`:
    /// `{a::B, c}` is `a::B` and `c`. Returns where the tree ends.
    fn tree(
        tokens: &[(Token, usize)],
        mut at: usize,
        prefix: Vec<String>,
        paths: &mut Vec<Vec<String>>,
    ) -> usize {
        match tokens.get(at) {
            Some((Token::Punct('{'), _)) => {
                at += 1;
                loop {
                    match tokens.get(at) {
                        None => return at,
                        Some((Token::Punct('}'), _)) => return at + 1,
                        Some((Token::Punct(','), _)) => at += 1,
                        // `a as b`: the new name names nothing further
                        Some((Token::Ident(word), _)) if word == "as" => at += 2,
                        Some(_) => {
                            let end = tree(tokens, at, prefix.clone(), paths);
                            at = if end == at { at + 1 } else { end };
                        }
                    }
                }
            }
            Some((Token::Ident(name), _)) => {
                let mut path = prefix;
                path.push(name.clone());
                if is_punct(tokens.get(at + 1), ':') && is_punct(tokens.get(at + 2), ':') {
                    tree(tokens, at + 3, path, paths)
                } else {
                    paths.push(path);
                    at + 1
                }
            }
            _ => {
                if !prefix.is_empty() {
                    paths.push(prefix);
                }
                at
            }
        }
    }

    /// Every `crate::...` path in the tokens, with the line it starts on. `$crate` in a macro is
    /// not one.
    fn crate_paths(tokens: &[(Token, usize)]) -> Vec<(Vec<String>, usize)> {
        let mut found = Vec::new();

        for at in 0..tokens.len() {
            let starts = is_ident(tokens.get(at), "crate")
                && is_punct(tokens.get(at + 1), ':')
                && is_punct(tokens.get(at + 2), ':')
                && !(at > 0 && is_punct(tokens.get(at - 1), '$'));

            if starts {
                let mut paths = Vec::new();
                tree(tokens, at + 3, Vec::new(), &mut paths);
                found.extend(paths.into_iter().map(|path| (path, tokens[at].1)));
            }
        }

        found
    }

    /// The modules a file declares, `mod x;` or `mod x { .. }`, test modules aside.
    fn declared_modules(source: &str) -> BTreeSet<String> {
        without_tests(lex(source))
            .windows(2)
            .filter(|pair| is_ident(pair.first(), "mod"))
            .filter_map(|pair| match &pair[1].0 {
                Token::Ident(name) => Some(name.clone()),
                Token::Punct(_) => None,
            })
            .collect()
    }

    /// Whether a file is test code as a whole: under a `test/` or `tests/` directory.
    pub(in crate::guard) fn is_test_file(path: &str) -> bool {
        let parts: Vec<&str> = path.split('/').collect();
        parts[..parts.len() - 1]
            .iter()
            .any(|directory| *directory == "test" || *directory == "tests")
    }

    /// The top-level module a file belongs to: `turso/oauth/pkce.rs` is `turso`, `backup.rs` is
    /// `backup`.
    fn module_of(path: &str) -> &str {
        let first = path.split('/').next().unwrap_or(path);
        first.strip_suffix(".rs").unwrap_or(first)
    }

    /// Every edge between two top-level modules, with each place it is named and the path's
    /// second segment there.
    type Edges = BTreeMap<(String, String), Vec<(String, Option<String>)>>;

    /// One violation: every place in the source that commits it, and for an edge on a cycle, one
    /// cycle it closes.
    #[derive(Debug, Default)]
    struct Found {
        cycle: Option<String>,
        places: BTreeSet<String>,
    }

    /// Everything the graph breaks, one line each, with where each occurs. `sources` are the
    /// crate's files as paths relative to `src/`, separated by `/`, and their text; `lib.rs`
    /// among them names the modules.
    fn violations(sources: &[(String, String)]) -> BTreeMap<String, Found> {
        let text_of = |wanted: &str| {
            sources
                .iter()
                .find(|(path, _)| path == wanted)
                .map(|(_, text)| text.as_str())
        };
        let modules = declared_modules(text_of("lib.rs").expect("the sources hold no lib.rs"));
        let mut edges = Edges::new();

        for (path, text) in sources {
            if path == "lib.rs" || path == "main.rs" || is_test_file(path) {
                continue;
            }

            let from = module_of(path);

            for (segments, line) in crate_paths(&without_tests(lex(text))) {
                let to = &segments[0];
                if to == from || !modules.contains(to) {
                    continue;
                }

                edges
                    .entry((from.to_string(), to.clone()))
                    .or_default()
                    .push((format!("{path}:{line}"), segments.get(1).cloned()));
            }
        }

        let mut found: BTreeMap<String, Found> = BTreeMap::new();

        for ((from, to), places) in &edges {
            if let Some(back) = path_between(&edges, to, from) {
                let entry = found.entry(format!("cycle {from} -> {to}")).or_default();
                entry.cycle = Some(format!("{from} -> {}", back.join(" -> ")));
                entry
                    .places
                    .extend(places.iter().map(|(place, _)| place.clone()));
            }
        }

        let mut note = |line: String, place: String| {
            found.entry(line).or_default().places.insert(place);
        };

        for rule in RULES {
            match rule {
                Rule::Never { from, to } => {
                    for (place, _) in edges
                        .get(&(from.to_string(), to.to_string()))
                        .into_iter()
                        .flatten()
                    {
                        note(format!("forbidden {from} -> {to}"), place.clone());
                    }
                }
                Rule::Surface { from, to } => {
                    let inner = text_of(&format!("{to}/mod.rs"))
                        .map(declared_modules)
                        .unwrap_or_default();

                    for (place, second) in edges
                        .get(&(from.to_string(), to.to_string()))
                        .into_iter()
                        .flatten()
                    {
                        if let Some(module) = second.as_ref().filter(|name| inner.contains(*name)) {
                            note(format!("forbidden {from} -> {to}::{module}"), place.clone());
                        }
                    }
                }
            }
        }

        found
    }

    /// The modules on a path from `start` to `goal`, both included, if there is one.
    fn path_between(edges: &Edges, start: &str, goal: &str) -> Option<Vec<String>> {
        let mut came_from: BTreeMap<&str, &str> = BTreeMap::new();
        let mut queue = VecDeque::from([start]);

        while let Some(here) = queue.pop_front() {
            if here == goal {
                let mut path = vec![goal.to_string()];
                let mut at = goal;
                while at != start {
                    at = came_from[at];
                    path.push(at.to_string());
                }
                path.reverse();
                return Some(path);
            }

            for (from, to) in edges.keys() {
                if from == here && to != start && !came_from.contains_key(to.as_str()) {
                    came_from.insert(to, from);
                    queue.push_back(to);
                }
            }
        }

        None
    }

    /// Every `.rs` file under `directory`, as a path relative to `root` with `/` separators.
    pub(in crate::guard) fn read_sources(
        root: &Path,
        directory: &Path,
        sources: &mut Vec<(String, String)>,
    ) {
        for entry in std::fs::read_dir(directory).expect("src/ could not be read") {
            let path = entry.expect("an entry of src/ could not be read").path();

            if path.is_dir() {
                read_sources(root, &path, sources);
            } else if path.extension().is_some_and(|extension| extension == "rs") {
                let relative = path
                    .strip_prefix(root)
                    .expect("a file outside src/")
                    .components()
                    .map(|part| part.as_os_str().to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join("/");
                let text = std::fs::read_to_string(&path).expect("a source file could not be read");
                sources.push((relative, text));
            }
        }
    }

    /// The lines of a baseline, comments and blank lines aside.
    fn listed(baseline: &str) -> Vec<String> {
        baseline
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
            .map(str::to_string)
            .collect()
    }

    /// **Criteria 5 (the Rust half) and 11.** The crate's top-level modules form no cycle and
    /// break no rule beyond what `cycle.baseline.txt` lists, and every line the baseline lists still
    /// occurs. A change that adds a violation fails here, naming it and where it is; a change that
    /// removes one fails until its line leaves the baseline.
    #[test]
    fn the_crate_modules_form_no_new_cycle_and_break_no_rule() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut sources = Vec::new();
        read_sources(&root, &root, &mut sources);

        assert!(
            sources.len() > 40,
            "src/ was not read: {} files",
            sources.len()
        );

        let baseline = listed(include_str!("cycle.baseline.txt"));
        let mut ordered = baseline.clone();
        ordered.sort();
        ordered.dedup();
        assert_eq!(
            baseline, ordered,
            "cycle.baseline.txt is kept sorted, one line per violation"
        );

        let found = violations(&sources);
        let added: Vec<String> = found
            .iter()
            .filter(|(line, _)| !baseline.contains(line))
            .map(|(line, found)| {
                let closes = found
                    .cycle
                    .as_ref()
                    .map(|cycle| format!("\n    closes {cycle}"))
                    .unwrap_or_default();
                let places: Vec<&str> = found.places.iter().map(String::as_str).collect();
                format!("{line}{closes}\n    at {}", places.join("\n    at "))
            })
            .collect();
        let gone: Vec<&str> = baseline
            .iter()
            .filter(|line| !found.contains_key(*line))
            .map(String::as_str)
            .collect();

        assert!(
            added.is_empty(),
            "a dependency between the crate's modules that cycle.baseline.txt does not list:\n{}",
            added.join("\n")
        );
        assert!(
            gone.is_empty(),
            "cycle.baseline.txt lists what no longer occurs; take these lines out of it:\n{}",
            gone.join("\n")
        );
    }

    /// And the check itself, on a crate made up here: a cycle is named from both sides, each rule
    /// is named where it is broken, and nothing is read from a comment, a string, a test module
    /// or a `test/` directory.
    #[test]
    fn the_module_check_names_a_cycle_and_each_rule() {
        let file = |path: &str, text: &str| (path.to_string(), text.to_string());
        let sources = vec![
            file(
                "lib.rs",
                "pub mod a;\npub mod b;\npub mod c;\npub mod sync;\npub mod organization;\n\
                 #[cfg(test)]\nmod tests {}\n",
            ),
            file("a.rs", "use crate::{b::Thing, c};\n"),
            file(
                "b/mod.rs",
                "mod inner;\npub fn f() -> u8 {\n    crate::a::g()\n}\n",
            ),
            file(
                "c.rs",
                "// crate::a::x\nconst S: &str = \"crate::b\";\nconst R: &str = r#\"crate::a\"#;\n\
                 #[cfg(test)]\nmod tests {\n    use crate::a::x;\n}\n",
            ),
            file("c/test/fixture.rs", "use crate::a::x;\n"),
            file(
                "sync/mod.rs",
                "pub mod turso;\nmod store;\npub use store::Store;\n",
            ),
            file("sync/store.rs", "use crate::organization::Held;\n"),
            file(
                "organization/mod.rs",
                "use crate::sync::{Store, turso::consent};\npub struct Held;\n",
            ),
        ];

        let found = violations(&sources);
        let lines: Vec<&str> = found.keys().map(String::as_str).collect();

        assert_eq!(
            lines,
            vec![
                "cycle a -> b",
                "cycle b -> a",
                "cycle organization -> sync",
                "cycle sync -> organization",
                "forbidden organization -> sync::turso",
                "forbidden sync -> organization",
            ]
        );
        assert!(found["cycle b -> a"].places.contains("b/mod.rs:3"));
        assert_eq!(found["cycle a -> b"].cycle.as_deref(), Some("a -> b -> a"));
        assert!(
            found["forbidden organization -> sync::turso"]
                .places
                .contains("organization/mod.rs:1")
        );
        assert_eq!(found["forbidden organization -> sync::turso"].cycle, None);
    }
}
