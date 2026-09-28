---
status: resolved
blocked-by: [27]
---
# refactor(desktop): the shell holds only the shell

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`layout/` becomes `shell/`. The organization and workspace menus and dialogs in it (`organization-dialogs`, `account-menu`, `account-signed-out`, `workspace-menu`, `workspace-locked`) move to their features and reach the shell as surface `slots`.

## Acceptance Criteria

Traces requirement 7 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 7.

- [x] `shell/` contains no organization or workspace module (criterion 7). Verified: `src/lib/layout` no longer exists; a search of `src/lib/shell` (tests aside) for any import from `$lib/organization` or `$lib/workspace` prints nothing. The workspace menu and locked state moved to `workspace/component/`, the account menu, signed-out row and dialogs to `organization/component/`, and they reach the rail and the root layout as typed slots (`slotsAt(place)` in `app/surfaces.ts`); `shell/tests/slots.svelte.test.ts` holds each place to the one component the shell drew there.
- [x] The baseline loses the organization and layout cycle. Verified: the baseline holds no `layout` line of any kind (the organization and layout cycle left when ticket 29 moved the command menu out of `layout/`, and no line names `layout` now).
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0, validate 0; tests changed only in paths.

## Relevant areas

- `src/lib/layout/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
