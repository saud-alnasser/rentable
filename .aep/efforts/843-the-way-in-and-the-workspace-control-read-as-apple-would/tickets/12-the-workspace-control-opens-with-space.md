---
status: resolved
blocked-by: []
---

# test(desktop): the workspace control opens with Space as well as Enter

## Outcome

The workspace control's keyboard test covers the half of spec criterion 13 that no ticket
verified: the menu opens with Space from focus on the trigger, as it does with Enter, and the open
workspace is announced as the checked one.

## Acceptance Criteria

Traces requirement 13 of [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]],
and its criterion 13.

- [x] A component test focuses the trigger, presses Space, and finds the menu open with focus inside
      it; Escape closes it and focus is back on the trigger. *Verified: `npx vitest run
      src/lib/workspace/tests/menu.svelte.test.ts` printed 9 passed, including "Space opens the menu
      with the open workspace checked, and Escape closes it back onto the trigger"; with the key
      changed to `x` the test failed, so it can.*
- [x] The same test finds the open workspace's row with `aria-checked="true"` while the menu is open.
      *Verified: the same test finds one checked `menuitemradio`, North Properties.*
- [x] No source outside the workspace feature's tests changes, unless the test finds Space does not
      open the menu, in which case the trigger is fixed and that is said in the commit. *Verified:
      Space already opens it; the diff touches only `menu.svelte.test.ts` among source files.*

## Relevant areas

- `apps/desktop/src/lib/workspace/tests/menu.svelte.test.ts`
- `apps/desktop/src/lib/workspace/component/menu.svelte`

## Notes

*Appended 2026-10-01 by converge, round 1: ticket 09 tested Enter, the arrows and Escape, and
criterion 13 names Enter or Space.*
