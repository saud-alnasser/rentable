//! the typed error surface. An error crosses the IPC boundary as
//! `{ code, message }`, where `code` is the stable discriminant TypeScript
//! branches on and `message` is the human-readable rendering. Every fallible
//! path in this crate returns it; new variants may be added, but a shipped
//! `code` never changes.

use std::fmt;

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum Error {
    /// required configuration is absent (an OAuth client id, an updater key).
    NotConfigured { message: String },
    /// caller-supplied input was rejected.
    InvalidInput { message: String },
    /// a referenced entity does not exist.
    NotFound { message: String },
    /// the operation is not allowed on this target (a protected snapshot).
    Forbidden { message: String },
    /// where a link's own standing is what refuses, after the code that opened
    /// it was right: the link has lapsed, was already opened, was withdrawn, or
    /// was replaced by a newer one. `reason` names which, so the screen routes
    /// on it and says its own sentence in the reader's language.
    ///
    /// **It is not `Forbidden`, which stays the wrong code and every other
    /// refusal on the merits.** All five of these crossed as one `forbidden`
    /// until effort 828, which left the connect screen unable to tell a
    /// mistyped code from a dead link, and the only thing separating them was
    /// English prose the other side is not allowed to read.
    Refused {
        reason: RefusalReason,
        message: String,
    },
    /// the system is not in the state the operation requires (database not
    /// connected, workspace not linked).
    PreconditionFailed { message: String },
    /// a resource is held by another operation (the sync lock, a pending
    /// recovery).
    Busy { message: String },
    /// the operation gave up waiting (a link session that never completed).
    TimedOut { message: String },
    /// the user abandoned the operation before it finished. Nothing went wrong
    /// and there is nothing to report — which is what separates it from every
    /// other variant here.
    Cancelled { message: String },
    /// stored or remote content failed verification (a content hash mismatch,
    /// an app-version mismatch).
    Integrity { message: String },
    /// a filesystem operation failed.
    Io { message: String },
    /// a request produced no usable answer: it never reached the remote (DNS,
    /// TLS, a timeout, a dropped connection), or the remote could not serve it.
    /// Distinct from a remote that answered and refused on the merits — that
    /// answer says what to change, and this one says only to try later.
    Network { message: String },
    /// a database operation failed.
    Database { message: String },
    /// a credential-store (keyring) operation failed.
    Credential { message: String },
    /// an internal invariant broke; not actionable by the user.
    Internal { message: String },
}

/// Why a link admits nobody, with the code it came with typed correctly.
///
/// Four values and no more: an invitation is `Lapsed`, `Consumed` or `Revoked`, and a machine
/// link is `Lapsed`, `Consumed` or `Replaced`. Each rides beside the message as a stable word,
/// which is what the connect screen names its refusals from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RefusalReason {
    /// past its moment, whether the link's own text says so or the row behind it does.
    Lapsed,
    /// opened once already, and it admits one.
    Consumed,
    /// withdrawn: the invitation it was made for is gone, or the member it named is.
    Revoked,
    /// no row stands behind it, because a newer link took its place.
    Replaced,
}

impl Error {
    /// extend the rendering, keeping the discriminant. A failure met while
    /// recovering from another one is context on the original — the caller
    /// still has to branch on what went wrong first.
    pub fn with_context(mut self, addition: &str) -> Self {
        let message = self.message_mut();
        *message = format!("{}; additionally {}", message, addition);

        self
    }

    fn message_mut(&mut self) -> &mut String {
        let (Self::NotConfigured { message }
        | Self::InvalidInput { message }
        | Self::NotFound { message }
        | Self::Forbidden { message }
        | Self::Refused { message, .. }
        | Self::PreconditionFailed { message }
        | Self::Busy { message }
        | Self::TimedOut { message }
        | Self::Cancelled { message }
        | Self::Integrity { message }
        | Self::Io { message }
        | Self::Network { message }
        | Self::Database { message }
        | Self::Credential { message }
        | Self::Internal { message }) = self;

        message
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (Self::NotConfigured { message }
        | Self::InvalidInput { message }
        | Self::NotFound { message }
        | Self::Forbidden { message }
        | Self::Refused { message, .. }
        | Self::PreconditionFailed { message }
        | Self::Busy { message }
        | Self::TimedOut { message }
        | Self::Cancelled { message }
        | Self::Integrity { message }
        | Self::Io { message }
        | Self::Network { message }
        | Self::Database { message }
        | Self::Credential { message }
        | Self::Internal { message }) = self;

        f.write_str(message)
    }
}

impl std::error::Error for Error {}

impl From<std::io::Error> for Error {
    fn from(error: std::io::Error) -> Self {
        Self::Io {
            message: error.to_string(),
        }
    }
}

impl From<sqlx::Error> for Error {
    fn from(error: sqlx::Error) -> Self {
        Self::Database {
            message: error.to_string(),
        }
    }
}

/// **Everything the replica engine can fail with is a database failure here, including a push
/// conflict.** `turso::Error` has no conflict variant: the sync engine constructs one, handles it
/// nowhere, and flattens it to a string on the way out, so telling a conflict from an unreachable
/// remote means matching prose. Nothing on this path pushes, so nothing here needs to — and a
/// mapping that guessed would be a guess a caller then branched on.
impl From<turso::Error> for Error {
    fn from(error: turso::Error) -> Self {
        Self::Database {
            message: error.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Error, RefusalReason};

    fn message() -> String {
        "something went wrong".to_string()
    }

    /// the pinned discriminant per variant. The match is exhaustive, so adding
    /// a variant fails to compile until its code is pinned here. `refused` is
    /// the one variant whose wire shape carries a third field, so it is pinned
    /// here and asserted in its own test below.
    fn stable_code(error: &Error) -> &'static str {
        match error {
            Error::NotConfigured { .. } => "notConfigured",
            Error::InvalidInput { .. } => "invalidInput",
            Error::NotFound { .. } => "notFound",
            Error::Forbidden { .. } => "forbidden",
            Error::Refused { .. } => "refused",
            Error::PreconditionFailed { .. } => "preconditionFailed",
            Error::Busy { .. } => "busy",
            Error::TimedOut { .. } => "timedOut",
            Error::Cancelled { .. } => "cancelled",
            Error::Integrity { .. } => "integrity",
            Error::Io { .. } => "io",
            Error::Network { .. } => "network",
            Error::Database { .. } => "database",
            Error::Credential { .. } => "credential",
            Error::Internal { .. } => "internal",
        }
    }

    #[test]
    fn every_variant_serializes_with_a_stable_code() {
        let variants = [
            Error::NotConfigured { message: message() },
            Error::InvalidInput { message: message() },
            Error::NotFound { message: message() },
            Error::Forbidden { message: message() },
            Error::PreconditionFailed { message: message() },
            Error::Busy { message: message() },
            Error::TimedOut { message: message() },
            Error::Cancelled { message: message() },
            Error::Integrity { message: message() },
            Error::Io { message: message() },
            Error::Network { message: message() },
            Error::Database { message: message() },
            Error::Credential { message: message() },
            Error::Internal { message: message() },
        ];

        for error in variants {
            let code = stable_code(&error);

            assert_eq!(
                serde_json::to_value(&error).expect("failed to serialize error"),
                serde_json::json!({ "code": code, "message": "something went wrong" }),
                "unexpected wire shape for {code}"
            );
        }
    }

    /// effort 828, requirement 1: a link refused on its own standing names which standing it was,
    /// beside the message rather than inside it, because the screen says its own sentence in the
    /// reader's language and a code that was merely wrong is a different answer.
    #[test]
    fn a_refused_link_carries_its_reason_beside_the_message() {
        let reasons = [
            (RefusalReason::Lapsed, "lapsed"),
            (RefusalReason::Consumed, "consumed"),
            (RefusalReason::Revoked, "revoked"),
            (RefusalReason::Replaced, "replaced"),
        ];

        for (reason, spelling) in reasons {
            let error = Error::Refused {
                reason,
                message: message(),
            };

            assert_eq!(
                serde_json::to_value(&error).expect("failed to serialize error"),
                serde_json::json!({
                    "code": "refused",
                    "reason": spelling,
                    "message": "something went wrong"
                }),
                "unexpected wire shape for {spelling}"
            );
            assert_eq!(error.to_string(), "something went wrong");
        }
    }

    #[test]
    fn display_renders_the_message() {
        let error = Error::NotFound {
            message: "oauth session not found".to_string(),
        };

        assert_eq!(error.to_string(), "oauth session not found");
    }

    #[test]
    fn context_extends_the_message_and_keeps_the_discriminant() {
        let error = Error::Io {
            message: "permission denied".to_string(),
        }
        .with_context("failed to write the recovery record");

        assert_eq!(
            error,
            Error::Io {
                message: "permission denied; additionally failed to write the recovery record"
                    .to_string()
            }
        );
    }

    #[test]
    fn io_errors_become_io_with_the_underlying_message() {
        let source = std::io::Error::new(std::io::ErrorKind::NotFound, "no such file");

        assert_eq!(
            Error::from(source),
            Error::Io {
                message: "no such file".to_string()
            }
        );
    }

    #[test]
    fn database_errors_become_database_with_the_underlying_message() {
        let source = sqlx::Error::RowNotFound;

        assert_eq!(
            Error::from(source),
            Error::Database {
                message: sqlx::Error::RowNotFound.to_string()
            }
        );
    }
}
