---
status: open
blocked-by: [21]
---
# refactor(desktop): the organization owns its host port

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The organization's types and methods in `platform/host.ts` (about lines 240-561 and 660-980) and its invokes in `platform/tauri.ts` move to `organization/host.ts` (the port) and `organization/tauri.ts` (the adapter). `app/host.ts` composes the `Host`; the test fake moves to `app/tests/`.

## Acceptance Criteria

Traces requirement 7 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 7.

- [ ] `platform/host.ts` holds no organization type (criterion 7).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/platform/host.ts`, `src/lib/platform/tauri.ts`, `src/lib/platform/tests/testing.ts`, `src/lib/api/context.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- [[rules/api-layer]]'s *every invoke belongs in the Tauri facade* becomes *in its concept's `tauri.ts` adapter* in this commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
