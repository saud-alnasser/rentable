---
status: resolved
blocked-by: [08, 10]
---

# test(desktop): every touched screen is walked in both languages and both appearances

## Outcome

Every screen this effort changed has been looked at in English and Arabic, light and dark, at
640x480 and at the default size: first by the orchestrator in screenshots, then by the human. What
the walk found is fixed or recorded.

## Acceptance Criteria

Traces requirements 1 and 14 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criteria 1, 9 and 14.

- [x] There are screenshots, in the four combinations at both sizes, of: the welcome, each first-run
      step, each join step, the wall, the no-workspace screen, the arrival loading, the workspace
      menu open, and a switch in progress. *Verified in part, as corrected below: 32
      screenshots of the welcome, its foot control, the connect step and the join's first step in
      English and Arabic, light and dark, at 1124x824 and 640x480 (the window resized from outside).
      The wall, the name and existing steps, the join's password, no-workspace, the arrival, the
      menu and a switch need an organization, which this worktree held only at the end; the human
      looked at those on the running build, the wall and the arrival among them.*
- [x] No text is clipped, and no number, link or code is reversed. *Verified: read off every
      screenshot; at 640x480 the welcome scrolls to its second choice and nothing is cut; Arabic
      keeps "1 من 2" and the link field left to right. The human found two lines placed oddly, fixed
      in tickets 20 and 21.*
- [x] The step transition runs the reading direction's way in both locales, and does not run at all
      under reduced motion. *Verified by test rather than on screen: the surface's and
      `crossWayIn`'s tests assert the shift for both directions and both readings, and no transition
      under reduced motion (ticket 14).*
- [x] Read off the tokens, text contrast is at least 4.5:1 and focus-ring contrast at least 3:1, in
      both appearances. *Verified: `tokens.test.ts` asserts 4.5:1 for text in both appearances
      (21 pass); computed from the tokens, the ring is 3.95:1 on the light background, 4.37:1 on a
      card, 5.94:1 and 5.45:1 in dark.*
- [x] The human has looked at the running build and said either that it is done or what to change.
      *Verified: the human walked the running build on 2026-10-01, asked for tickets 20 and 21, and
      then said "push changes; update pr/issue be ready for merge".*

## Relevant areas

- the whole of the way in, and `workspace/component/menu.svelte`

## Constraints

- This is a human check: it is held to the close of the run, and earlier tickets do not wait on it.
- Ask before driving the app while the human is at the machine.

## Notes

*Corrected 2026-10-01 at the human's word: criterion 1's screenshots cover the screens this worktree
could reach, and the screens that need an organization were judged by the human on the running
build, who then called the build ready for merge.*
