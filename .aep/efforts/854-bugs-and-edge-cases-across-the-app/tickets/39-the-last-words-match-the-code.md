---
status: open
blocked-by: [37, 38]
---

# docs(desktop): the last contexts and rules match the code

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]]. Raised by review round 2 (2026-10-07).

## Outcome

The persistence and contract contexts and the frontend rule state what tickets 33 to 38 made true, and ticket 36 records why it carries no changeset.

## Acceptance Criteria

Traces requirements 17, 25 and 26, and criteria 17 and 26.

- [ ] [[contexts/desktop/persistence]] says the launch names the file in Arabic and English with what to do, and the reason goes to the log under `startup.failed`.
- [ ] [[contexts/desktop/contract]]'s Refund entry says an edited refund may always keep or lower its amount, even past the limit; [[rules/frontend]] calls the create control the one control that draws a create but the contract's refund ([[rules/interface]] *Create*).
- [ ] Ticket 36's Notes say `a-damaged-settings-file-no-longer-stops-the-app.md` already tells the user the file is named in a message.

## Relevant areas

- `.aep/contexts/desktop/{persistence,contract}.md`
- `.aep/rules/frontend.md`
- `.aep/efforts/854-bugs-and-edge-cases-across-the-app/tickets/36-*.md`

## Constraints

- Nothing a user observes changes; no changeset.
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
