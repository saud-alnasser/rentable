---
status: open
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

- [ ] There are screenshots, in the four combinations at both sizes, of: the welcome, each first-run
      step, each join step, the wall, the no-workspace screen, the arrival loading, the workspace
      menu open, and a switch in progress.
- [ ] No text is clipped, and no number, link or code is reversed.
- [ ] The step transition runs the reading direction's way in both locales, and does not run at all
      under reduced motion.
- [ ] Read off the tokens, text contrast is at least 4.5:1 and focus-ring contrast at least 3:1, in
      both appearances.
- [ ] The human has looked at the running build and said either that it is done or what to change.

## Relevant areas

- the whole of the way in, and `workspace/component/menu.svelte`

## Constraints

- This is a human check: it is held to the close of the run, and earlier tickets do not wait on it.
- Ask before driving the app while the human is at the machine.
