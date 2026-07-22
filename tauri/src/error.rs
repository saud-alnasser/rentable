//! the typed error surface. An error crosses the IPC boundary as
//! `{ code, message }`, where `code` is the stable discriminant TypeScript
//! branches on and `message` is the human-readable rendering. String-typed
//! results migrate here in batches (#112); new variants may be added, but a
//! shipped `code` never changes.

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
    /// the system is not in the state the operation requires (database not
    /// connected, workspace not linked).
    PreconditionFailed { message: String },
    /// a resource is held by another operation (the sync lock, a pending
    /// recovery).
    Busy { message: String },
    /// the operation gave up waiting (a link session that never completed).
    TimedOut { message: String },
    /// stored or remote content failed verification (a content hash mismatch,
    /// an app-version mismatch, a corrupt manifest).
    Integrity { message: String },
    /// a filesystem operation failed.
    Io { message: String },
    /// a database operation failed.
    Database { message: String },
    /// a credential-store (keyring) operation failed.
    Credential { message: String },
    /// an internal invariant broke; not actionable by the user.
    Internal { message: String },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (Self::NotConfigured { message }
        | Self::InvalidInput { message }
        | Self::NotFound { message }
        | Self::Forbidden { message }
        | Self::PreconditionFailed { message }
        | Self::Busy { message }
        | Self::TimedOut { message }
        | Self::Integrity { message }
        | Self::Io { message }
        | Self::Database { message }
        | Self::Credential { message }
        | Self::Internal { message }) = self;

        f.write_str(message)
    }
}

impl std::error::Error for Error {}

/// the migration bridge: a function still returning `Result<_, String>` can
/// `?` a typed sub-result while #112 converts call sites in batches.
impl From<Error> for String {
    fn from(error: Error) -> Self {
        error.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::Error;

    fn message() -> String {
        "something went wrong".to_string()
    }

    /// the pinned discriminant per variant. The match is exhaustive, so adding
    /// a variant fails to compile until its code is pinned here.
    fn stable_code(error: &Error) -> &'static str {
        match error {
            Error::NotConfigured { .. } => "notConfigured",
            Error::InvalidInput { .. } => "invalidInput",
            Error::NotFound { .. } => "notFound",
            Error::Forbidden { .. } => "forbidden",
            Error::PreconditionFailed { .. } => "preconditionFailed",
            Error::Busy { .. } => "busy",
            Error::TimedOut { .. } => "timedOut",
            Error::Integrity { .. } => "integrity",
            Error::Io { .. } => "io",
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
            Error::Integrity { message: message() },
            Error::Io { message: message() },
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

    #[test]
    fn display_renders_the_message() {
        let error = Error::NotFound {
            message: "oauth session not found".to_string(),
        };

        assert_eq!(error.to_string(), "oauth session not found");
    }

    #[test]
    fn string_conversion_preserves_the_message() {
        let converted: String = Error::Busy {
            message: "another recovery is still pending".to_string(),
        }
        .into();

        assert_eq!(converted, "another recovery is still pending");
    }
}
