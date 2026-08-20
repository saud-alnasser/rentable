---
'@rentable/desktop': patch
---

a component that fails while drawing no longer takes the window with it. the screen it was on is replaced with a card that says what happened and offers to draw it again or to leave for the dashboard, with the rail and the titlebar still there. where the chrome itself is what failed there is no rail to keep, so the same card is drawn on its own rather than a blank window. both are written to the diagnostics file on this machine
