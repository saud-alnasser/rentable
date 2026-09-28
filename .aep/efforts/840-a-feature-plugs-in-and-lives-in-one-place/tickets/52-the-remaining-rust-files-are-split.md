---
status: open
blocked-by: [51]
---
# refactor(tauri): the remaining oversized Rust files are split

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Every Rust source file still over 1,000 production lines is split along its concerns (at least `authority.rs`, `role`, `invitation`, `turso/platform.rs` with its live and fake adapters apart, `schema.rs`, `discovery.rs`), and `database/commands.rs` is `command.rs`.

## Acceptance Criteria

Traces requirements 14 and 17 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 14 and 17.

- [ ] No Rust production file passes 1,000 lines, or it is named in [[rules/module-layout]] with why (criterion 17).
- [ ] The Rust naming baseline is empty (criterion 14).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
