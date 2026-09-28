---
status: open
blocked-by: [54]
---
# refactor(tauri): sync becomes a plugin

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`sync` becomes a plugin managing its own state; its TypeScript adapter follows.

## Acceptance Criteria

Traces requirement 9 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 9.

- [ ] `sync` is a plugin; `lib.rs` names none of its commands (criterion 9).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/sync/`, `src/lib/sync/tauri.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
