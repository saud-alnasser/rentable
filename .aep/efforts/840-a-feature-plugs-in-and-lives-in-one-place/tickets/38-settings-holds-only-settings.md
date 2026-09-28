---
status: open
blocked-by: [22]
---
# refactor(desktop): settings holds only settings

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`settings/query.ts` splits: sync state to `sync/`, workspace rename and earlier records to `workspace/`, updates and restart to `update/`; its nine raw `createMutation` become `declareMutation`; the shell's sidebar reads sync state from `sync/`.

## Acceptance Criteria

Traces requirements 7 and 13 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 7 and 13.

- [ ] `settings/query.ts` holds only settings, and no raw `createMutation` remains outside `mutation/` (criteria 7 and 13).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/settings/query.ts`, `src/lib/layout/component/sidebar.svelte:15`, `src/lib/workspace/earlier.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
