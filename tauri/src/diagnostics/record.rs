use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// the marker a redacted value is replaced with. It is written in full rather
/// than as a mask of the original length, because the length of a secret is
/// itself worth withholding.
pub const REDACTED: &str = "[redacted]";

/// field names that *name* a secret rather than describe one. Matched as
/// substrings against the lowercased name, so `refreshToken`, `client_secret`,
/// and `Authorization` are all caught by one entry each.
const SECRET_NAME_MARKERS: [&str; 7] = [
    "token",
    "secret",
    "password",
    "passphrase",
    "credential",
    "authorization",
    "cookie",
];

/// markers that identify a credential inside a value whatever the field is
/// called. An error message quoting a request URL, or a header echoed back in
/// a failure, carries a token under a field name nobody thought to guard.
///
/// The three Google shapes are here because Google is the only provider this
/// application authenticates against: an access token, a refresh token, and an
/// OAuth client secret respectively.
const SECRET_VALUE_MARKERS: [&str; 5] = ["bearer ", "ya29.", "1//", "gocspx-", "goog_"];

/// the separators a `name=value` pair is written with in the two places a
/// secret arrives inside prose: a query string and a form body.
const PAIR_SEPARATORS: [char; 3] = ['&', '?', ' '];

/// how much attention an event deserves.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticLevel {
    Info,
    Warn,
    Error,
}

/// one thing that happened, named and described in fields.
///
/// `event` is a dotted name — `migration.applied`, `sync.push.failed` — so a
/// reader can select one kind of event without matching prose, and so the name
/// survives its message being reworded.
///
/// Fields are always strings. A diagnostics file is read by a person first, and
/// a typed field that is sometimes absent reads worse than one that is simply
/// not there.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiagnosticRecord {
    pub level: DiagnosticLevel,
    pub event: String,
    #[serde(default)]
    pub fields: BTreeMap<String, String>,
}

/// one written line. Separate from [`DiagnosticRecord`] because the time an
/// event is written is the sink's to say, not the caller's.
#[derive(Serialize)]
struct DiagnosticLine<'a> {
    at: i64,
    level: DiagnosticLevel,
    event: &'a str,
    fields: &'a BTreeMap<String, String>,
}

impl DiagnosticRecord {
    /// an event with no fields yet.
    pub fn new(level: DiagnosticLevel, event: impl Into<String>) -> Self {
        Self {
            level,
            event: event.into(),
            fields: BTreeMap::new(),
        }
    }

    /// add one particular. A repeated name replaces the earlier value.
    pub fn with(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.fields.insert(name.into(), value.into());

        self
    }

    /// the same event with every secret this crate recognises removed.
    ///
    /// Applied by the sink rather than by callers — see
    /// [`crate::diagnostics::DiagnosticLog::append`]. A redaction rule each
    /// call site has to remember is one that holds until somebody forgets, and
    /// the call sites that matter most are written while chasing a bug.
    ///
    /// **Recognition is what bounds this.** A field whose *name* says it holds
    /// a secret goes whole; anything else is searched for the credential shapes
    /// this application handles, in a value and inside prose quoting a request.
    /// A secret in a shape not listed here is written, which is why the
    /// interface says the log carries no *recognised* credential rather than
    /// promising it carries none.
    pub fn redacted(mut self) -> Self {
        self.event = redact_within(&self.event);
        self.fields = self
            .fields
            .into_iter()
            .map(|(name, value)| {
                let value = if names_a_secret(&name) {
                    REDACTED.to_string()
                } else {
                    redact_within(&value)
                };

                (redact_within(&name), value)
            })
            .collect();

        self
    }

    /// this event as the single JSON line it is written as, without its
    /// terminator.
    pub fn to_line(&self, at: i64) -> String {
        let line = DiagnosticLine {
            at,
            level: self.level,
            event: &self.event,
            fields: &self.fields,
        };

        serde_json::to_string(&line).unwrap_or_else(|error| {
            format!(
                r#"{{"at":{at},"level":"error","event":"diagnostics.unserializable","fields":{{"error":"{}"}}}}"#,
                error.to_string().replace('"', "'")
            )
        })
    }
}

fn names_a_secret(name: &str) -> bool {
    let name = name.to_lowercase();

    SECRET_NAME_MARKERS
        .iter()
        .any(|marker| name.contains(marker))
}

/// `text` with every recognised credential replaced.
///
/// Pairs go first, and that ordering is the whole reason this is worth having:
/// a `name=value` pair loses only its value, so an error quoting a failed
/// request still says which request failed. Only what survives that is tested
/// against the whole-value markers — a credential still recognisable after the
/// pairs are cleaned is one sitting loose in the prose, and there is no way to
/// take it without taking the sentence.
fn redact_within(text: &str) -> String {
    let redacted = if SECRET_NAME_MARKERS
        .iter()
        .any(|marker| text.to_lowercase().contains(marker))
    {
        text.split_inclusive(PAIR_SEPARATORS)
            .map(redact_pair_value)
            .collect()
    } else {
        text.to_string()
    };

    let lowercased = redacted.to_lowercase();

    if SECRET_VALUE_MARKERS
        .iter()
        .any(|marker| lowercased.contains(marker))
    {
        return REDACTED.to_string();
    }

    redacted
}

fn redact_pair_value(pair: &str) -> String {
    let Some((name, value)) = pair.split_once('=') else {
        return pair.to_string();
    };

    if !names_a_secret(name) || value.is_empty() {
        return pair.to_string();
    }

    let separator = value
        .chars()
        .last()
        .filter(|character| PAIR_SEPARATORS.contains(character));

    match separator {
        Some(separator) => format!("{name}={REDACTED}{separator}"),
        None => format!("{name}={REDACTED}"),
    }
}
