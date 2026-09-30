---
status: resolved
blocked-by: [01]
---
# refactor(desktop): forms are a capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`design/form.ts` becomes `src/lib/form/` with an `index.ts`.

## Acceptance Criteria

Traces requirement 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 20.

- [x] Its importers import `$lib/form` (criterion 20). Verified: `grep -rn design/form apps/desktop/src` prints nothing; 15 source files import from `'$lib/form'`, whose `index.ts` exports `onSubmit` and `surfaceForm`.
- [x] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19). Verified: in the run's tree: check 0, eslint 0, `pnpm test` 3 of 3 tasks, build:web 0; no assertion line changed in any test (one comment names the new path).

## Relevant areas

- `src/lib/design/form.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
