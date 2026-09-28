//! everything that brings an install of 0.12 to 0.15 forward, in one place, so a release that no
//! longer carries those installs removes it in one step (effort 840, requirement 15).
//!
//! Three paths, each run once on the machine that needs it and never again:
//!
//! - [`record`]: the records 0.12.0 and 0.13.0 kept in `app.db`, read as the whole-workspace
//!   export so the interface brings them in through the import it already has.
//! - [`format`]: an organization made in an earlier format, upgraded in place by its owner's
//!   machine through each change of format in order, with what format 1 signed and how it judged a
//!   row.
//! - [`shape`]: what a machine holds in a shape this build replaced, found at startup and
//!   forgotten.
//!
//! **Nothing names this module but the session that runs it.** The organization's session
//! (`organization/session/`) is where a sign-in, a resume, a connect and the launch's first
//! state read reach it, and the composition root registers the two commands `record` answers.
//! Everything else in the crate is below it: this module reads the organization's store, its
//! chain and its vaults, and nothing there names it back. `guard/cycle.rs` holds that, with the
//! rule that admits only the session.
//!
//! **What it reads stays exactly as it was written.** Every read of an older format, every
//! signature check and every stored spelling here is what those installs left on disk, and moving
//! this code changed none of them.

pub mod format;
pub mod record;
pub mod shape;
