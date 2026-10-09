---
status: open
blocked-by: [27]
---

# docs(861-the-app-never-shows-something-false): this effort's on-screen checks are staged

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 12).

## Outcome

Every on-screen check this effort left under `## Needs you` is a state the owner steps to, and each was entered and looked at in both languages and appearances before the hand-off.

## Acceptance Criteria

Traces requirement 12 and criterion 12.

- [ ] A state for each on-screen check: the error toast staying and closing on its side (ticket 02), the fills (ticket 01), the discard question's focus (ticket 06), each form asking only after a change (ticket 07), the four toast washes (ticket 24), and the landing screen of a member who may view nothing (converge).
- [ ] Each state was entered and screenshotted in Arabic and English, light and dark, and what was seen is written in `evidence/staging/needs-you.md`.
- [ ] The owner has the window and the list.

## Relevant areas

- .aep/efforts/861-the-app-never-shows-something-false/log.md (`## Needs you`), apps/desktop/src/lib/prototype/stage/

## Constraints

- The states are untracked files in the `_stage` worktree; only the evidence file is committed.

## Notes
