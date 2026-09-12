---
status: resolved
blocked-by: []
---

# fix(organization): the schema guard reads a pulled row, and the loopback closes cleanly

## Outcome

`workspace_open`'s schema-version guard reads a freshly pulled organization row rather than whatever
this machine last saw (F6), so an older build does not pass the guard on a stale row and then pull
migrated pages it cannot understand; and the consent loopback closes its socket cleanly rather than
aborting it, so the callback test does not flake on Windows (F8).

## Acceptance Criteria

Traces requirement 24 of [[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its
criterion 24.

- [x] **The guard reads a pulled row.** `workspace_open` pulls the organization replica before
      reading `schema_version`, so a version another machine raised is seen before the guard runs.
      The lease serialises the writers; the pull is what keeps a reader from opening across one.
      *Verified: `command.rs::workspace_open` now calls `store.pull().await` before
      `store.workspaces(...)` and the `refuse_newer`/`is_pending` guard, with the reason in the
      comment. `cargo build --tests` clean; the residual instant between pull and open is bounded by
      the lease and is a live-only proof, out of scope for a non-live fix.*
- [x] **The loopback closes cleanly.** `LoopbackRequest::respond` flushes, shuts the write half
      (a FIN rather than an RST), and drains the peer before dropping the socket, so a Windows client
      reads the page instead of a reset connection.
      *Verified: `sync/oauth/loopback.rs::respond` does so; the consent suite
      (`a_callback_whose_state_does_not_match_...` among it) passed five runs in a row after the
      change, where it had failed one in four before.*
- [x] `cargo test` and `cargo clippy` pass.
      *Verified: `cargo test` 274 passed / 10 ignored; consent subset 20/20 over five runs;
      `cargo clippy --all-targets` at the pre-existing warnings; `cargo fmt --check` clean.*

## Constraints

- A changeset is not written, for the reason ticket 23 gives.
