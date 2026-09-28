---
status: open
blocked-by: [48]
---
# refactor(tauri): organization commands act through one helper

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`organization/act.rs` holds `as_member` (plan, *Ports*): the signed-in check, the pull and the machine lock in the order `command.rs` runs them. Every command uses it; one whose order differs keeps its own and says why in a comment.

## Acceptance Criteria

Traces requirement 10 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 10.

- [ ] No organization command calls `signed_in(` inline (criterion 10).
- [ ] Every organization command test passes unchanged.
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/organization/command.rs`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
