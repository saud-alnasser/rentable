---
status: open
blocked-by: [02]
---
# chore(tauri): dead Rust items and the retired vocabulary are removed

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The `#[allow(dead_code)]` items (`database/proxy.rs:316` `log`, the OAuth refresh fields and form in `sync/oauth/token.rs`), `error.rs` `with_context` and its test go. Comments describing Google, Drive and the control plane are corrected to what the code does now (`diagnostics/record.rs`, `database/version.rs`, `database/mod.rs`, `sync/oauth/*`, `sync/test/server.rs`), and the Google-shaped redaction markers (`ya29.`, `gocspx-`) leave the redaction list.

## Acceptance Criteria

Traces requirement 16 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 16.

- [ ] No `#[allow(dead_code)]` remains; `cargo test` passes (criterion 16).
- [ ] A search of `tauri/src/` for Google, Drive and control plane finds only the serde names the upgrade ticket will hold (criterion 16).

## Relevant areas

- the files named above

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The serde reads of `"googleDrive"`, `"hosted"` and `controlPlaneSession` in `sync/store.rs` stay: they are live compatibility and move in the upgrade ticket.
