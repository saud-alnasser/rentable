---
status: open
blocked-by: [30, 31]
---
# refactor(desktop): the organization groups its sub-concepts

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`organization/` becomes `member/`, `role/`, `access/`, `workspace/`, `setup/`, `session/` sub-directories in the canonical shape; the workspace sub-domain that belongs to `workspace/` moves there; `organization/query.ts` (1,142 lines) splits per sub-concept and its 34 raw `createMutation` calls become `declareMutation`; `component/host.svelte` and `setup-walk.svelte` split.

## Acceptance Criteria

Traces requirements 6, 13 and 17 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 6, 13 and 17.

- [ ] No raw `createMutation` in `organization/` (criterion 13).
- [ ] Sub-concepts are directories, not filename prefixes (criterion 6).
- [ ] No file in `organization/` passes 500 lines (criterion 17).
- [ ] The baseline loses the organization and workspace cycle.
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/organization/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
