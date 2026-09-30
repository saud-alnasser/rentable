---
'@rentable/desktop': patch
---

closing a delete that cannot go ahead, because something still depends on the record, no longer shows the delete form for a moment as the dialog leaves; the dialog keeps saying what it said until it is gone, and the same holds for every confirmation.
