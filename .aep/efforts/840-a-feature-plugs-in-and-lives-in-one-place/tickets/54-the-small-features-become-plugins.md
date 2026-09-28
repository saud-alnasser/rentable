---
status: open
blocked-by: [53]
---
# refactor(tauri): database, print, update, transfer and startup become plugins

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The five become plugins the same way; `export.rs` and `import.rs` become `transfer/`. The two hot database commands keep their shape behind `plugin:database|`.

## Acceptance Criteria

Traces requirement 9 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 9.

- [ ] Each is a plugin with a derived list; `lib.rs` names none of their commands (criterion 9).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `tauri/src/{database,print,update,export,import,bootstrap}`, `src/lib/platform/database/client.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
