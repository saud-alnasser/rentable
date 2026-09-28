---
status: open
blocked-by: [23]
---
# refactor(desktop): every feature that crosses to Rust owns its host port

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The rest of `platform/host.ts` that is a feature's (remote sync, update, print, export, import, earlier records, settings, bootstrap) moves the way the organization's did. `platform/host.ts` keeps window, dialog, the database transport and diagnostics.

## Acceptance Criteria

Traces requirement 7 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 7.

- [ ] `platform/host.ts` holds only platform capabilities (criterion 7).
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/platform/host.ts`, `src/lib/platform/tauri.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
