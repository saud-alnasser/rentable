---
status: resolved
---
# build(tauri): the crate builds on Windows against the webview it links

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Found while building tickets 02 and 03: at `origin/main` the crate's library does not compile on Windows. The lockfile resolves tauri 2.12.0, which links `webview2-com` 0.39.1 and `windows` 0.62.2, while `Cargo.toml` still names 0.38.2 and 0.61.3 for the print dialog. The print module is handed the controller from the newer crate and fails to type-check (six errors, E0271, E0277, E0308). Those two dependencies name the versions tauri already links, as their comment says they should, so the crate builds and its tests run on Windows, with no source change. It lands first, because every Rust ticket after it is verified by `cargo test` here.

## Acceptance Criteria

Traces requirement 19 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 19.

- [x] `cargo test --lib` in `apps/desktop/tauri` compiles and passes on Windows (criterion 19). Verified: `cargo test --lib` printed `test result: ok. 631 passed; 0 failed; 11 ignored`; before the change it failed with 6 errors in the print module.
- [x] The lockfile only drops the duplicate older `webview2-com` and `windows` versions; nothing is added. Verified: `git diff Cargo.lock` removes the 0.38.2 and 0.61.3 package entries; its only added lines are dependency references losing their version suffix now that one version remains.

## Relevant areas

- `apps/desktop/tauri/Cargo.toml`, `apps/desktop/tauri/Cargo.lock`, the print module

## Constraints

- Behaviour does not change (requirement 19); the print module's source is untouched.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
