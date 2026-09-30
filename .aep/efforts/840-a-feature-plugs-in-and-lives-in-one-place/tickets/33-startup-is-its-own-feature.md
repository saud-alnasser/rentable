---
status: resolved
blocked-by: [32]
---
# refactor(desktop): startup is a feature of its own

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`layout/startup*.ts` and the seven `startup-*.svelte` become `src/lib/startup/`; `startup.ts` (1,027 lines) is split along its concerns.

## Acceptance Criteria

Traces requirements 7 and 17 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 7 and 17.

- [x] `shell/` holds no startup module (criterion 7). Verified: `find src/lib/shell -iname '*startup*' -o -iname '*migration*'` prints nothing; startup lives in `src/lib/startup/`, and the rail gets `onSwitchWorkspace` from the root layout through the frame, so the shell imports startup by type only.
- [x] No file in `startup/` passes 500 lines (criterion 17). Verified: `find src/lib/startup -type f | xargs wc -l`: the largest files are `tests/sign-in.svelte.test.ts` at 500 (unchanged by the move) and `tests/launch.test.ts` at 452; the largest source file is `machine.ts` at 435.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0, validate 0; the old `startup.test.ts` split into three files holding the same 39 tests and assert lines.

## Relevant areas

- `src/lib/layout/startup*`, `src/lib/layout/component/startup-*.svelte`, [[contexts/desktop/organization]] (its `paths:` names `layout/startup.ts`)

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
