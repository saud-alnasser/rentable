---
status: open
blocked-by: [46]
---
# refactor(tauri): the shell has one error type and one scratch helper

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`PlatformError`, `SyncRefusal`, `ReplicationRefusal` fold into `error::Error`; `Result<_, String>` goes (`transition/two.rs`, `print.rs`, `authority.rs`); repeated `map_err` becomes `From` where the mapping is the same; the local `refused()` and `integrity()` helpers go. The 28 test scratch-directory helpers become one in `test/`.

## Acceptance Criteria

Traces requirement 13 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 13.

- [ ] No error enum beside `error::Error`, no `Result<_, String>`, one scratch helper (criterion 13).
- [ ] Every refusal reason string crossing to the interface is unchanged.
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/error.rs`, `turso/platform.rs`, the 28 helper sites

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
