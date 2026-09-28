---
status: open
blocked-by: [57, 41]
---
# docs(aep): the tree and its description agree

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Every rule's and context's `paths:` glob matches the tree, a test holds that, [[contexts/repository]] lists the homes and the four layers as they are, and one artifact lists what adding a feature touches; the naming baselines are empty. The list is checked by adding a throwaway record kind in a scratch branch and counting the files it touched.

## Acceptance Criteria

Traces requirements 2, 14 and 18 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]], and criteria 2, 14 and 18.

- [ ] A test fails on a `paths:` glob matching no file (criterion 18).
- [ ] `validate.mjs` passes (criterion 18).
- [ ] Adding a throwaway kind hand-edits only what criterion 2 allows, and the commit body lists the files it took (criterion 2).
- [ ] Both naming baselines are empty (criterion 14).

## Relevant areas

- `.aep/rules/`, `.aep/contexts/`

## Constraints

- Behaviour does not change (requirement 19); anything found that would change it is written down for a follow-up effort, not fixed here.
- One commit, and it passes the integration gate alone ([[rules/version-control]]).
- A violation this removes deletes its line from the dependency or naming baseline in the same commit.
