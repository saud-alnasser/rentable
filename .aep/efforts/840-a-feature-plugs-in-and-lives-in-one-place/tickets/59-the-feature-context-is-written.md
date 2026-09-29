---
status: open
blocked-by: [58, 63]
---
# docs(aep): the feature context says how features are handled

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

`.aep/contexts/desktop/feature.md` describes, from the finished tree and never from the plan, how a feature and a capability are built, declared, registered, added and removed on both sides of the IPC boundary, with the layer rule and tenant and undo as worked examples. [[contexts/repository]] links it.

## Acceptance Criteria

Traces requirement 21 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criterion 21.

- [ ] The file exists with a `use-when` for adding, removing or changing a feature or capability, and `paths:` covering `src/lib/app/`, `src/lib/feature/` and `tauri/src/lib.rs` (criterion 21).
- [ ] Every path it names exists (criterion 21).
- [ ] `validate.mjs` passes and the index is regenerated.

## Relevant areas

- `.aep/contexts/`, `.aep/templates/context.template.md`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
