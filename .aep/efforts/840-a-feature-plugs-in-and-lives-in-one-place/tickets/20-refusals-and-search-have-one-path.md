---
status: open
blocked-by: [01]
---
# refactor(desktop): refusals and record search each have one path

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Refusal handling spread over `api/refusal.ts`, `error/refusal.ts` and `sync/refusal.ts` is one path: each feature declares its codes in its own `refusal.ts`, `api/refusal.ts` unions them, and `error/refusal.ts` alone turns a code into a sentence. Search keeps one SQL matching helper (`platform/database/search.ts`) and one caller-side module.

## Acceptance Criteria

Traces requirement 13 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 13.

- [ ] A search finds no second refusal or search module (criterion 13).
- [ ] The type check that fails on a code without a sentence still fails.
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/api/refusal.ts`, `src/lib/error/refusal.ts`, `src/lib/sync/refusal.ts`, `src/lib/api/search.ts`, `src/lib/platform/database/search.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
