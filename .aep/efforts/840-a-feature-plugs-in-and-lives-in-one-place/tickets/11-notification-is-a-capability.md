---
status: open
blocked-by: [01]
---
# refactor(desktop): notifications are a capability

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`error/toast.ts` and `design/provider/sonner.svelte` become `src/lib/notification/`: `index.ts` exposes how a feature says something to the reader, and the provider is mounted where it is today.

## Acceptance Criteria

Traces requirement 20 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 20.

- [ ] No toast call reaches the design package's `Toaster` except through `notification/` (criterion 20).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/error/toast.ts`, `src/lib/design/provider/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
