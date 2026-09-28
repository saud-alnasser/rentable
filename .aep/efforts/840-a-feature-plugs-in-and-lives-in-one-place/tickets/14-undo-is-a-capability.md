---
status: open
blocked-by: [12, 13]
---
# refactor(desktop): undo and redo are one capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The stacks, issuing an inverse, the undo shortcut and the toast's undo action become `src/lib/undo/` (was `design/inverse.ts`, `inverse.svelte.ts`, `undo-shortcut.ts`). `mutation/` calls undo's API when a declaration carries an `inverse`; nothing else in the tree knows how undo works. This is the worked case of requirement 20.

## Acceptance Criteria

Traces requirement 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 20.

- [ ] A search finds undo logic nowhere outside `undo/` (criterion 20).
- [ ] The undo tests move and keep their assertions.
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/design/inverse*.ts`, `src/lib/design/undo-shortcut.ts`, `src/lib/design/mutation.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
