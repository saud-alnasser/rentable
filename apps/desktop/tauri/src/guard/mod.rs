//! The crate's structural guards (effort 840): tests that read `src/` as text and hold it to
//! `rules/module-layout`. Each keeps a baseline beside it of what it tolerates today, and fails on
//! anything new and on any line that no longer occurs, so a baseline can only shrink. `clock` holds
//! it to requirement 12 instead, and `error` to requirement 13, and neither keeps a baseline because
//! nothing it forbids occurs. Nothing here ships.

mod clock;
mod cycle;
mod error;
mod naming;
