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
    /// a refusal a person caused and can answer: a name left empty, an act their role does not
    /// include, a link that lapsed, a group that already holds an organization. `reason` names
    /// which, from the one list in [`RefusalReason`], and the interface says its own sentence for
    /// it in the reader's language. `message` is a developer's description; where it carries
    /// Turso's own words the interface shows them behind a details disclosure and nowhere else.
    ///
    /// **Every refusal a person can cause is this variant** (effort 832, requirement 23). Until
    /// then only a link's standing was, and the rest crossed as `forbidden`, `invalidInput`,
    /// `notFound` or `preconditionFailed` with English prose the interface showed raw or matched
    /// by phrase. Those four remain for the rest of the crate; the organization and sync modules
    /// raise none of them, and `refusals_in_the_shell_carry_a_reason` below says so.
    ///
    /// A failure nobody can act on, a file that will not open or a row that fails its signature,
    /// keeps its own variant and reads as that variant's generic sentence.
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

/// Why a person was refused, as one stable word the interface names its sentence from.
///
/// **One list for the whole shell**, spelled in camelCase on the wire and mirrored word for word
/// by `TAURI_REFUSAL_REASONS` in `src/lib/error/tauri.ts`, whose test reads this enum back out of
/// this file. The sentence for each is `common.refusals.host.<reason>` in both locales, so a word
/// added here and not there fails a test on the other side rather than showing English.
///
/// **A word, and no values.** A sentence that needs a name says it without one: the reader is
/// looking at what they tried to act on, and the name sits in `message` for whoever reads a log.
///
/// The first four are a link's standing after its code was right (effort 828): an invitation is
/// `Lapsed`, `Consumed` or `Revoked`, and a machine link is `Lapsed`, `Consumed` or `Replaced`.
/// The connect screen routes on those four by name. Every other word was added by effort 832,
/// but the two for the organization's format and the one for a rank, which effort 838 added.
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

    // a link and the code read out with it.
    /// no code was typed beside the link.
    CodeMissing,
    /// the code does not open the link.
    CodeWrong,
    /// what was pasted is not a rentable join link, or is missing a part of one.
    LinkUnreadable,
    /// the link connects another machine, and was opened where an invitation is accepted.
    LinkNotAnInvitation,
    /// the link is an invitation, and was opened where a machine is connected.
    LinkNotForAMachine,
    /// this machine already holds another organization.
    AnotherOrganizationHeld,

    // signing in, and the session behind it.
    /// the username and password do not open a place in the organization.
    CredentialsWrong,
    /// the password is under the floor.
    PasswordTooShort,
    /// the password has to be changed before anything else.
    PasswordChangeRequired,
    /// nobody is signed in on this machine.
    SignedOut,
    /// this machine holds no organization.
    NoOrganization,
    /// this machine holds an organization and no member in it yet.
    NoMemberYet,
    /// the session's own row, or the key it remembers, is gone; signing in again answers it.
    SignInAgain,
    /// the reader was removed from the organization.
    YouWereRemoved,
    /// the reader's sessions were ended from another machine.
    SessionsEnded,
    /// the organization key this session derives is not the one in force any more.
    KeyNotInForce,

    // members and what may be done to them.
    /// the username is not three to thirty-two letters, digits, dots, underscores or hyphens.
    UsernameInvalid,
    /// the username is taken in this organization.
    UsernameTaken,
    /// a role that is neither administrator nor member.
    RoleUnknown,
    /// the member acted on is not in this organization.
    MemberMissing,
    /// the member's row is gone from the organization.
    MemberGone,
    /// the member acted on was removed.
    MemberRemoved,
    /// an act somebody may not do to their own account.
    NotYourself,
    /// an act nobody may do to the owner's account.
    OwnerProtected,
    /// an act only the owner may do.
    OwnerOnly,
    /// an act that needs the Turso account, which is connected on the owner's machine.
    OwnerMachineOnly,
    /// the reader's role does not include the act.
    RoleLacksAct,
    /// the reader holds no administrator certificate.
    NotAdministrator,
    /// the role acted on, or the member's role, is not ranked below the reader's (effort 838,
    /// requirement 7).
    RankNotAbove,

    // handing the organization over.
    /// the owner offered the organization to themselves.
    AlreadyOwner,
    /// the account offered the organization has no password of its own yet.
    AccountNotSetUp,
    /// an offer already stands.
    OfferPending,
    /// the offer was accepted, and the organization is theirs.
    OfferAccepted,
    /// no offer stands.
    NothingOffered,
    /// the account that made the offer is no longer in the organization.
    OffererGone,

    // workspaces and grants.
    /// the organization was given no name.
    OrganizationNameMissing,
    /// the workspace was given no name.
    WorkspaceNameMissing,
    /// the workspace acted on is not in this organization.
    WorkspaceMissing,
    /// no workspace is open on this machine.
    NoWorkspaceOpen,
    /// the reader holds no grant on the workspace.
    NoGrant,
    /// the member holds no grant on the workspace.
    GrantMissing,
    /// a grant on a workspace the granter holds only read-only.
    GrantBeyondOwn,
    /// this machine holds no credential to the organization database.
    NoOrganizationCredential,
    /// a newer rentable upgraded the workspace.
    WorkspaceNewer,
    /// the workspace is behind this version, and read-only access cannot bring it up.
    WorkspaceBehind,
    /// the database refused a schema or a lease, and nothing was changed.
    DatabaseRefused,

    // the organization's format (effort 838, requirement 11).
    /// the organization was made by an earlier version of rentable, and is exported there, deleted
    /// and made again here.
    OrganizationOlder,
    /// the organization was made by a newer version of rentable, which this one is updated to.
    OrganizationNewer,

    // Turso: the consent, the group and the account.
    /// this machine holds no Turso authority.
    TursoNotConnected,
    /// Turso would not identify the account, so the consent has to be granted again.
    ConsentNeededAgain,
    /// the consent this screen was waiting on is not one this run started.
    ConsentGone,
    /// the group typed is not the one the consent is over.
    GroupMismatch,
    /// Turso took none of the groups this application could name, so the person names it.
    GroupNeeded,
    /// the group already holds an organization.
    GroupHoldsOrganization,
    /// the consent is over a group that holds no database.
    GroupEmpty,
    /// the consented account holds no organization to connect to.
    NothingToConnectTo,
    /// Turso would not create the organization's database.
    CreateRefused,
    /// Turso refused a request on its merits.
    TursoRefused,
    /// Turso refused a request over the account itself: its plan, its standing or its limits.
    TursoAccountRefused,

    // the organization's mark.
    /// the image is over the size a mark may be.
    MarkTooLarge,
    /// the file is not a PNG, JPEG or WebP image.
    MarkNotAnImage,
}

impl Error {
    /// a refusal a person caused, with the word the interface says its sentence from and a
    /// developer's description beside it.
    pub fn refused(reason: RefusalReason, message: impl Into<String>) -> Self {
        Self::Refused {
            reason,
            message: message.into(),
        }
    }

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

    /// effort 832, requirement 23: a refusal from any command beyond the link's four carries its
    /// reason the same way, and the word is what the interface names its sentence from.
    #[test]
    fn a_refusal_carries_its_reason_as_one_camel_case_word() {
        let reasons = [
            (RefusalReason::CodeWrong, "codeWrong"),
            (RefusalReason::OwnerOnly, "ownerOnly"),
            (RefusalReason::GroupNeeded, "groupNeeded"),
            (RefusalReason::TursoNotConnected, "tursoNotConnected"),
            (RefusalReason::LinkNotForAMachine, "linkNotForAMachine"),
        ];

        for (reason, spelling) in reasons {
            let error = Error::refused(reason, "a developer's description");

            assert_eq!(
                serde_json::to_value(&error).expect("failed to serialize error"),
                serde_json::json!({
                    "code": "refused",
                    "reason": spelling,
                    "message": "a developer's description"
                }),
                "unexpected wire shape for {spelling}"
            );
        }
    }

    /// The four variants a refusal used to cross as, before it carried a reason.
    const REASONLESS_REFUSALS: [&str; 4] = [
        "Error::Forbidden",
        "Error::InvalidInput",
        "Error::NotFound",
        "Error::PreconditionFailed",
    ];

    /// every source file under `directory`, skipping the shared test scaffolding under `test/`.
    fn sources(directory: &std::path::Path, found: &mut Vec<std::path::PathBuf>) {
        let entries = std::fs::read_dir(directory).expect("the source directory did not read");

        for entry in entries {
            let path = entry.expect("a directory entry did not read").path();

            if path.is_dir() {
                if path.file_name().is_some_and(|name| name != "test") {
                    sources(&path, found);
                }
            } else if path.extension().is_some_and(|extension| extension == "rs") {
                found.push(path);
            }
        }
    }

    /// Effort 832, requirement 23: **every command under `organization/` and `sync/` refuses a
    /// person with a reason.** A refusal a person can cause is `Refused`, and a failure nobody can
    /// act on keeps its own variant (`Integrity`, `Internal`, `Io`, `Network`, `Database`,
    /// `Credential`, or `NotConfigured` for this build's own configuration).
    ///
    /// *Read off the source, because the question is about every construction and not about the
    /// ones a test happens to reach.* The four variants a refusal used to cross as are not raised
    /// anywhere in those modules outside their tests, so whatever a command there refuses a person
    /// with carries a reason the interface has a sentence for. Each module's own tests assert the
    /// reason its refusals carry.
    #[test]
    fn refusals_in_the_shell_carry_a_reason() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut files = Vec::new();

        sources(&root.join("organization"), &mut files);
        sources(&root.join("sync"), &mut files);
        assert!(files.len() > 20, "the modules were not found: {files:?}");

        let mut reasonless = Vec::new();

        for file in files {
            let source = std::fs::read_to_string(&file).expect("a source file did not read");
            // a module's tests sit at its foot, and they may name any variant they like.
            let shipped = source
                .find("#[cfg(test)]\nmod ")
                .map_or(source.as_str(), |foot| &source[..foot]);

            for (index, line) in shipped.lines().enumerate() {
                for variant in REASONLESS_REFUSALS {
                    let named = line.match_indices(variant).any(|(at, _)| {
                        !line[at + variant.len()..].starts_with(|next: char| next.is_alphanumeric())
                    });

                    if named {
                        reasonless.push(format!(
                            "{}:{}: {}",
                            file.display(),
                            index + 1,
                            line.trim()
                        ));
                    }
                }
            }
        }

        assert!(
            reasonless.is_empty(),
            "a refusal without a reason:\n{}",
            reasonless.join("\n")
        );
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
