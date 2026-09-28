---
status: resolved
blocked-by: [12]
---
# refactor(desktop): create is a capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`design/create-intent.svelte.ts`, `create-key.ts`, `create-target.svelte.ts`, `landing.svelte.ts` and `design/block/create-control.svelte` become `src/lib/create/`, with the design package's `create-intent.ts` reached only from there.

## Acceptance Criteria

Traces requirement 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 20.

- [x] Create machinery lives only in `create/` (criterion 20). Verified: a search of `apps/desktop/src` outside `create/` and tests for `createTargets`, `CREATE_KEYS`, `toCreateShortcut`, `consumeCreateIntent`, `hasCreateIntent`, `create-intent.js` and `whenSurfacesClose` finds only call sites whose names are imported from `$lib/create`; the design package's `create-intent` is imported only inside `create/`. `layout/create.ts` (the command menu's create group) stays for the palette ticket 29, as the plan places it.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree, after resolving six import conflicts with ticket 15 and pruning 12 stale baseline lines the older side carried: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0, validate 0; test changes are import paths and comments only.

## Relevant areas

- the files named

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
