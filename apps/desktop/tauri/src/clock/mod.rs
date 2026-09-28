//! the one way this application reads the time, as a port.
//!
//! A moment is milliseconds since the Unix epoch, as an `i64`, which is what every record, row and
//! message in this crate stores. **Only this module reads the system time**; everything else is
//! handed a clock, so a test can say what the time is rather than race it (effort 840,
//! requirement 12). `guard/clock.rs` holds the rest of the crate to that.
//!
//! **Two adapters, and which one runs is decided by whoever builds the clock.** `System` is the
//! machine's clock and is what the application manages at launch (`lib.rs`), before anything that
//! reads it. `Fixed` is a test's, and answers the one moment it was made with.
//!
//! **A command takes the clock as managed state and reads it at its edge**, or hands it down to
//! whatever reads the time later; code that outlives a command (the workspace engine, the machine
//! record, the organization replica) is given the clock when it is built and keeps it.

#[cfg(test)]
mod fixed;
mod system;

use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

#[cfg(test)]
pub use fixed::Fixed;
pub use system::System;

/// A moment: milliseconds since the Unix epoch.
pub type Timestamp = i64;

/// Something that says what the time is.
pub trait Clock: Send + Sync {
    /// The moment it is now.
    fn now(&self) -> Timestamp;
}

/// The clock as the application holds it: managed once at launch, and cloned into whatever
/// outlives a command.
pub type Shared = Arc<dyn Clock>;

/// A moment the system reported, as a [`Timestamp`]. A time before the epoch is the epoch.
pub fn from(time: SystemTime) -> Timestamp {
    time.duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as Timestamp
}

#[cfg(test)]
mod tests {
    use super::{Clock, Fixed, System, from};

    #[test]
    fn a_fixed_clock_answers_the_moment_it_was_made_with() {
        let clock = Fixed(1_757_000_000_000);

        assert_eq!(clock.now(), 1_757_000_000_000);
        assert_eq!(clock.now(), 1_757_000_000_000);
    }

    #[test]
    fn the_system_clock_answers_milliseconds_since_the_epoch() {
        let before = from(std::time::SystemTime::now());
        let now = System.now();

        assert!(now >= before && now - before < 60_000);
    }
}
