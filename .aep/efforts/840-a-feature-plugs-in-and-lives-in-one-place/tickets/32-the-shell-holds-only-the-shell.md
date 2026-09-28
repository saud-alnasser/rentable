---
status: open
blocked-by: [27]
---
# refactor(desktop): the shell holds only the shell

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`layout/` becomes `shell/`. The organization and workspace menus and dialogs in it (`organization-dialogs`, `account-menu`, `account-signed-out`, `workspace-menu`, `workspace-locked`) move to their features and reach the shell as surface `slots`.

## Acceptance Criteria

Traces requirement 7 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 7.

- [ ] `shell/` contains no organization or workspace module (criterion 7).
- [ ] The baseline loses the organization and layout cycle.
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/layout/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
