---
status: open
blocked-by: [50]
---
# refactor(tauri): organization commands live with their sub-concept

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`organization/command.rs` (49 commands) splits into `member/`, `role/`, `invitation/`, `workspace/`, `ownership/`, `session/`, `setup/`, `mark/`, `lease/` modules, each with its commands and the logic it owns (`role.rs`, `invite.rs`, `session.rs`, `setup.rs`, and `migration.rs` with `migrate.rs` as `lease/`). The `GATES` table and the tests that read it follow.

## Acceptance Criteria

Traces requirements 10 and 14 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 10 and 14.

- [ ] One subdirectory per sub-concept with its own commands (criterion 10).
- [ ] `migrate.rs` and `migration.rs` no longer sit side by side (criterion 14).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/organization/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
