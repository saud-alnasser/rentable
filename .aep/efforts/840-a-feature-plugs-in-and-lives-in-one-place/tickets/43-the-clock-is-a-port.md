---
status: resolved
blocked-by: [02]
---
# refactor(tauri): the clock is a port

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`timestamp.rs` becomes `clock/`: a `Clock` trait with `System` and `Fixed` adapters, managed with `Builder::manage`. No production logic outside `clock/` reads the system time.

## Acceptance Criteria

Traces requirement 12 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 12.

- [x] A test finds no `SystemTime::now` outside `clock/` in production sources (criterion 12). Verified: `guard::clock::tests::nothing_outside_the_clock_reads_the_system_time` passes; a scratch `std::time::SystemTime::now()` appended to `settings.rs` made `cargo test --lib guard::clock` fail naming `settings.rs:286`; reverted. Production code reads the time through `clock::Shared` (managed) or a holder (`Database`, `RemoteSync`, `OrganizationStore`); `RemoteSyncStore::sanitize`'s fills moved into `RemoteSync::reconcile`, the only production load.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, `cargo test --lib` `637 passed; 0 failed; 11 ignored`, no new clippy warning, check 0, `pnpm test` 0; test changes are the clock argument only.

## Relevant areas

- `tauri/src/timestamp.rs`, the files calling `SystemTime::now`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
