---
status: obsolete
blocked-by: [06, 09, 10, 13, 16, 17, 18, 19, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55]
---

# chore(desktop): the human checks

Blocked by: 06, 09, 10, 13, 16, 17, 18, 19, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Everything a test cannot see is checked in the running application and handed to the human together at the close: both directions, both appearances, the keyboard alone and reduced motion across every surface the effort changed, the two-machine sign-out, and the export of a never-held workspace.

## Acceptance Criteria

Traces requirements 9, 10, 15 and 21, and criteria 10, 15, 18 and 21.

- [ ] Every surface in criteria 1 to 20 walked in Arabic and English, light and dark, by keyboard alone, and with reduced motion on, with screenshots.
- [ ] The grids show three, two and one columns at real widths.
- [ ] Two installs: one machine ended while offline reaches the wall when it comes back; ended while closed, at its next launch.
- [ ] A workspace never held on this machine is exported while another is open, and no `ws-<id>.db` appears.
- [ ] The human's verdict on each is recorded here.

## Verdict

Obsolete 2026-10-03, released by the human: "push changes; update pr/issue be ready for merge". The human walked the running app across 2026-10-02 and 2026-10-03 (tickets 30 to 55 are those walks' notes), in English, at the window widths they used. The boxes above stay unticked because no one recorded each check as passed: Arabic, dark appearance, keyboard alone and reduced motion were not walked as a set; the two-install sign-out and the export of a never-held workspace were not run. They are named in the pull request for whoever merges.

## Relevant areas

- the running application; `apps/desktop/src/lib/prototype/` is not used

## Constraints

- Ask before driving the application while the human is at the machine.
