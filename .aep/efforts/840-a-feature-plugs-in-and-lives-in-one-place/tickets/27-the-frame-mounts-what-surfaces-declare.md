---
status: resolved
blocked-by: [21]
---
# refactor(desktop): the frame mounts the hosts features declare

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`feature/surface.ts` holds the `Surface` contract (plan, *Interfaces*); each feature with a host gets a `surface.ts`; `app/surfaces.ts` lists them; `frame.svelte` mounts `surface.host` for each instead of importing each host.

## Acceptance Criteria

Traces requirements 1 and 2 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 1 and 2.

- [x] `frame.svelte` imports no feature (criterion 2). Verified: a search of `layout/component/frame.svelte` for an import of any feature prints nothing, and the layer baseline has no `layout/component/frame` line; the frame mounts each `host` from `app/surfaces.ts` in its order. The four capability hosts (shortcut listener, undo and create shortcuts, print sheet) stay mounted through their `ui.ts`, since they take the frame's props or sit outside the print-hidden root; the palette now mounts after the hosts, which the orchestrator accepted: every dialog involved portals on open, and the palette still registers its shortcut before the shortcut sheet.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0; no assertion line changed in any test.

## Relevant areas

- `src/lib/layout/component/frame.svelte:7,210`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
