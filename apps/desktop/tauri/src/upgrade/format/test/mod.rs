//! scaffolding the tests of the owner's upgrade share: the runner's, at the foot of `runner/mod.rs`,
//! and each change of format's, at the foot of its own file (ticket 29).
//!
//! **Scaffolding and not a fixture** (`rules/testing`, as the human admitted it on 2026-09-27):
//! what is here stands in for what the tests cannot run, as `sync/test/server.rs` stands in for a remote. [`older`] is the build before
//! effort 838, writing an organization of format 1 that nothing in this build writes any more;
//! [`remote`] is a remote the upgrade pushes to and pulls from, answering as it is told. What is
//! cheap to write out, a credential slot or a table-by-table snapshot, is written out in each test
//! module that uses it.

pub(crate) mod older;
pub(crate) mod remote;
