---
status: open
blocked-by: [35]
---
# refactor(desktop): every other feature and capability carries its own strings

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

The rest of each locale file moves the same way; `i18n/{en,ar}/index.ts` hold only the imports, the shared vocabulary (`common.actions`, `labels`, `nav` and the like) and the composed object.

## Acceptance Criteria

Traces requirement 8 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 8.

- [ ] A test holds each locale index to imports, shared vocabulary and the composed object (criterion 8).
- [ ] `i18n-types.ts` regenerates identical.
- [ ] The integration gate passes on this commit; no test assertion changes except where it names a moved path (criterion 19).

## Relevant areas

- `src/lib/i18n/en/index.ts`, `src/lib/i18n/ar/index.ts`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
- The rules and contexts whose `paths:` or prose describe what this moves are rewritten in the same commit (spec, *Constraints*).
