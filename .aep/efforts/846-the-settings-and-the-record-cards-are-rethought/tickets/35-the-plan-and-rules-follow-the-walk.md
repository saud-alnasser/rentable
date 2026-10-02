---
status: open
blocked-by: [34]
---

# docs(aep): the plan and the rules follow the human's walk

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The documents the walk's tickets (31 to 34) left behind are corrected: plan.md's *Everything in a tab is a card*, *The section is a grid of group cards* and *Detail that few readers need folds under its row* describe one column, the button alone red, three folding rows and the icon controls, with a dated note; [[rules/interface]]'s *List presentation* names the member tile (188) and the workspace tile (174) beside the others; the motion of the two glyphs and the seal's preview as its own control are where [[rules/interface]] and [[contexts/desktop/components]] would look for them.

## Acceptance Criteria

Traces requirement 22 and criterion 22.

- [ ] Each statement above reads as built, with file and line quoted in the commit body.
- [ ] `node .aep/scripts/validate.mjs` passes and the index is regenerated.

## Relevant areas

- `.aep/efforts/846-the-settings-and-the-record-cards-are-rethought/plan.md`, `.aep/rules/interface.md`, `.aep/contexts/desktop/components.md`

## Constraints

- No source change.
