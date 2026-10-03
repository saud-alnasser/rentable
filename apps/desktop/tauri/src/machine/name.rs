//! the name this machine's operating system gives it, which is what a member's list of machines
//! reads as (effort 846, requirement 11).
//!
//! **The operating system's name and not one the person typed.** A machine names itself when it
//! signs in, so the list reads as the reader's own computers rather than identifiers, and nobody is
//! asked anything. On Windows that is the computer name rather than a friendlier one, which is the
//! risk the plan records; a name that cannot be read is no name, and the interface says what it
//! says for a machine with none rather than showing an id.

/// The most characters a machine's name is kept to, on the way in and on the way out: a name
/// somebody wrote around the command is held to it as well as the one this machine read.
pub const NAME_LENGTH: usize = 64;

/// What this machine's operating system calls it, trimmed and held to [`NAME_LENGTH`], or `None`
/// where it gives nothing.
///
/// `whoami::devicename` answers a `Result` in 2.x (`whoami-2.1.3/src/api.rs`): the "pretty name"
/// on macOS, the DNS host name on Windows, and the pretty host name or the host name on Linux. A
/// refusal is the same answer as an empty name.
pub fn this_machine() -> Option<String> {
    whoami::devicename().ok().and_then(|name| trimmed(&name))
}

/// `name` trimmed and cut to [`NAME_LENGTH`] characters, or `None` where nothing is left.
///
/// **By character, never by byte**, so a name in Arabic is cut between letters rather than through
/// one, and what is left is trimmed again so a cut never ends on a space.
pub fn trimmed(name: &str) -> Option<String> {
    let kept: String = name.trim().chars().take(NAME_LENGTH).collect();
    let kept = kept.trim_end();

    (!kept.is_empty()).then(|| kept.to_string())
}

#[cfg(test)]
mod tests {
    use super::{NAME_LENGTH, this_machine, trimmed};

    #[test]
    fn a_name_is_trimmed_and_an_empty_one_is_none() {
        assert_eq!(
            trimmed("  Olivia's Laptop \n").as_deref(),
            Some("Olivia's Laptop")
        );
        assert_eq!(trimmed(""), None);
        assert_eq!(trimmed(" \t\n "), None);
    }

    /// Capped at sixty-four characters, counted as characters: an Arabic name of seventy letters
    /// keeps sixty-four of them, and a cut that lands on a space does not keep it.
    #[test]
    fn a_name_is_capped_at_sixty_four_characters() {
        let long = "ح".repeat(70);
        let kept = trimmed(&long).expect("a name");

        assert_eq!(kept.chars().count(), NAME_LENGTH);

        let spaced = format!("{} tail", "a".repeat(NAME_LENGTH - 1));

        assert_eq!(trimmed(&spaced), Some("a".repeat(NAME_LENGTH - 1)));
    }

    /// What the operating system answers here is whatever this machine is called; whatever it
    /// is, it reaches the caller already trimmed and within the cap.
    #[test]
    fn this_machines_name_is_already_trimmed_and_capped() {
        if let Some(name) = this_machine() {
            assert_eq!(trimmed(&name).as_deref(), Some(name.as_str()));
            assert!(name.chars().count() <= NAME_LENGTH);
        }
    }
}
