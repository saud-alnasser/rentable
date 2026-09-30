---
status: resolved
blocked-by: [48]
---
# refactor(tauri): organization commands act through one helper

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`organization/act.rs` holds `as_member` (plan, *Ports*): the signed-in check, the pull and the machine lock in the order `command.rs` runs them. Every command uses it; one whose order differs keeps its own and says why in a comment.

## Acceptance Criteria

Traces requirement 10 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 10.

- [x] No organization command calls `signed_in(` inline (criterion 10). Verified: the only `signed_in(` calls left in `organization/command.rs` are lines 3744 and 3800, both `super::signed_in` inside `mod tests`; 35 command bodies go through `organization/act.rs` `as_member` or `if_member` (member lock for writing, organization lock for reading, the signed-out refusal, then the optional pull), and `workspace_open`, `organization_renew_due` and `organization_account_refusal_detail` keep their own order with a comment saying why. The helper reads no clock and takes no machine lock, since either would move an effect.
- [x] Every organization command test passes unchanged. Verified: no test file changed; `cargo test --lib` `642 passed; 0 failed; 11 ignored`, including `every_organization_command_names_its_gate` and the cycle guard.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: `cargo fmt --check` 0, the tests above, clippy at its seven pre-existing warnings; the change touches three Rust files and no TypeScript.

## Relevant areas

- `tauri/src/organization/command.rs`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
