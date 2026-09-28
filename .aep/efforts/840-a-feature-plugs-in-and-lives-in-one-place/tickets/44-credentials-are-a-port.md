---
status: open
blocked-by: [02]
---
# refactor(tauri): the credential store is a port

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`keyring.rs` becomes `credential/`: a `CredentialStore` trait with `Os` and `Memory` adapters, managed with `Builder::manage`, replacing the 18 `cfg(test)` switches. Tests construct their own `Memory` and stop serialising on `take_the_credential_store()`.

## Acceptance Criteria

Traces requirement 12 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 12.

- [ ] No `cfg(test)` or `cfg(not(test))` switches credential behaviour in production code (criterion 12).
- [ ] No test takes a shared credential lock (criterion 12).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/keyring.rs`, `organization/forget.rs:613` and the other callers

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- [[rules/credentials]] governs this move; the module stays private to the crate.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
