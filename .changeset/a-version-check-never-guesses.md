---
'@rentable/desktop': patch
---

a workspace whose versions rentable cannot read is kept read-only rather than sent; a version check that fails for a moment no longer makes the organization read-only; a change saved just as a newer rentable's upgrade arrives is refused rather than kept; opening a workspace that needs bringing up, in an organization a newer rentable upgraded, now asks you to update instead of failing partway; and removing an organization no longer leaves its update notice on the next one
