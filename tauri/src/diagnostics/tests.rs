use super::{DiagnosticLevel, DiagnosticLog, DiagnosticRecord, REDACTED, RotationLimits};

use std::path::PathBuf;

fn unique_dir(name: &str) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos();

    std::env::temp_dir()
        .join("rentable-tests")
        .join(format!("diagnostics-{name}-{nanos}"))
}

fn event(name: &str) -> DiagnosticRecord {
    DiagnosticRecord::new(DiagnosticLevel::Info, name)
}

fn written_files(directory: &PathBuf) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(directory)
        .expect("failed to read the diagnostics directory")
        .map(|entry| entry.expect("failed to read a diagnostics entry").path())
        .collect();

    files.sort();
    files
}

#[test]
fn an_event_is_one_json_line_carrying_the_time_it_was_written() {
    let line = event("migration.applied")
        .with("file", "0004_add_contracts.sql")
        .to_line(1_754_000_000_000);

    assert_eq!(
        line,
        r#"{"at":1754000000000,"level":"info","event":"migration.applied","fields":{"file":"0004_add_contracts.sql"}}"#
    );
    assert!(
        !line.contains('\n'),
        "an event must occupy exactly one line"
    );
}

#[test]
fn a_field_that_names_a_secret_is_redacted() {
    let redacted = event("account.linked")
        .with("accessToken", "ya29.a0AfH6SM")
        .with("refresh_token", "1//04dXm")
        .with("Authorization", "Bearer abc")
        .with("clientSecret", "GOCSPX-3f")
        .with("password", "hunter2")
        .with("email", "someone@example.com")
        .redacted();

    for name in [
        "accessToken",
        "refresh_token",
        "Authorization",
        "clientSecret",
        "password",
    ] {
        assert_eq!(
            redacted.fields.get(name).map(String::as_str),
            Some(REDACTED),
            "{name} was written through"
        );
    }

    assert_eq!(
        redacted.fields.get("email").map(String::as_str),
        Some("someone@example.com"),
        "redaction must leave what makes a log worth reading"
    );
}

#[test]
fn a_token_is_redacted_under_a_field_name_nobody_guarded() {
    let redacted = event("sync.push.failed")
        .with(
            "error",
            "GET https://drive.googleapis.com/v3/files?token=ya29.a0AfH6SM failed",
        )
        .with("header", "authorization: Bearer 1234")
        .with("cursor", "1//04dXmRefresh")
        .redacted();

    // named in a pair, so the request survives and only its token goes — the
    // failing call is most of what makes the entry worth keeping.
    assert_eq!(
        redacted.fields.get("error").map(String::as_str),
        Some("GET https://drive.googleapis.com/v3/files?token=[redacted] failed")
    );

    // loose in the prose, with no pair to cut at: there is no way to take the
    // credential without taking the sentence around it.
    assert_eq!(
        redacted.fields.get("header").map(String::as_str),
        Some(REDACTED)
    );
    assert_eq!(
        redacted.fields.get("cursor").map(String::as_str),
        Some(REDACTED)
    );
}

/// the criterion the ticket asks for, asserted against the file rather than
/// against the redaction function: writing is the only door to disk, so a
/// record that arrives unredacted arrives unredacted for every caller.
#[test]
fn a_secret_never_reaches_the_file_by_any_route() {
    let directory = unique_dir("redaction");
    let log = DiagnosticLog::new(directory.clone(), RotationLimits::DEFAULT)
        .expect("failed to open the log");

    let leaks = [
        event("account.linked").with("refreshToken", "1//04dXmSecret"),
        event("sync.push.failed").with("error", "denied for Bearer ya29.leaked"),
        // the shape a token exchange fails in: a form body quoted whole, under
        // a field name that says nothing about what it carries.
        event("sync.token.refreshFailed").with(
            "error",
            "POST /token failed: grant_type=refresh_token&client_secret=GOCSPX-3fLeaked",
        ),
        // arriving from the webview, where the event name is not a literal
        // this crate wrote.
        event("failed for ya29.leaked").with("stage", "upload"),
    ];

    for leak in leaks {
        log.append(leak, 1_754_000_000_000)
            .expect("failed to append");
    }

    let contents =
        std::fs::read_to_string(directory.join("rentable.log")).expect("failed to read the log");

    for secret in ["1//04dXmSecret", "ya29.leaked", "GOCSPX-3fLeaked"] {
        assert!(!contents.contains(secret), "{secret} reached the file");
    }

    assert!(
        contents.contains("grant_type=refresh_token"),
        "redaction took the request with the secret, leaving nothing to diagnose"
    );
    assert!(contents.contains(REDACTED));

    std::fs::remove_dir_all(&directory).ok();
}

#[test]
fn the_log_stays_within_its_limits_however_much_is_written() {
    let directory = unique_dir("rotation");
    let limits = RotationLimits {
        max_file_bytes: 512,
        max_files: 3,
    };
    let log = DiagnosticLog::new(directory.clone(), limits).expect("failed to open the log");

    for index in 0..400 {
        log.append(
            event("sync.pull.completed").with("run", index.to_string()),
            index,
        )
        .expect("failed to append");
    }

    let files = written_files(&directory);
    let total: u64 = files
        .iter()
        .map(|file| {
            std::fs::metadata(file)
                .expect("failed to measure a diagnostics file")
                .len()
        })
        .sum();

    assert_eq!(files.len(), limits.max_files);
    assert!(
        total <= limits.max_total_bytes(),
        "{total} bytes exceeds the {} the limits promise",
        limits.max_total_bytes()
    );

    std::fs::remove_dir_all(&directory).ok();
}

/// the one exception the limits document: an event too large for a file is
/// written whole rather than truncated, because half a JSON line is not an
/// event. It is pinned so that the overshoot stays one line's worth.
#[test]
fn one_event_larger_than_a_file_is_written_whole() {
    let directory = unique_dir("oversized");
    let limits = RotationLimits {
        max_file_bytes: 128,
        max_files: 2,
    };
    let log = DiagnosticLog::new(directory.clone(), limits).expect("failed to open the log");
    let oversized = "x".repeat(512);

    log.append(event("backup.createFailed").with("error", &oversized), 1)
        .expect("failed to append");

    let contents =
        std::fs::read_to_string(directory.join("rentable.log")).expect("failed to read the log");

    assert!(contents.contains(&oversized), "the event was truncated");
    assert!(
        contents.len() as u64 > limits.max_file_bytes,
        "this test no longer exercises an oversized event"
    );

    std::fs::remove_dir_all(&directory).ok();
}

#[test]
fn rotation_discards_the_oldest_events_and_keeps_the_newest() {
    let directory = unique_dir("recency");
    let log = DiagnosticLog::new(
        directory.clone(),
        RotationLimits {
            max_file_bytes: 256,
            max_files: 2,
        },
    )
    .expect("failed to open the log");

    for index in 0..40 {
        log.append(
            event("startup.completed").with("run", index.to_string()),
            index,
        )
        .expect("failed to append");
    }

    let current =
        std::fs::read_to_string(directory.join("rentable.log")).expect("failed to read the log");
    let everything: String = written_files(&directory)
        .iter()
        .map(|file| std::fs::read_to_string(file).expect("failed to read a diagnostics file"))
        .collect();

    assert!(
        current.contains(r#""run":"39""#),
        "the newest event is gone"
    );
    assert!(
        !everything.contains(r#""run":"0""#),
        "the oldest event survived a rotation that should have discarded it"
    );

    std::fs::remove_dir_all(&directory).ok();
}
