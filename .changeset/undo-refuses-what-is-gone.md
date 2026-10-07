---
'@rentable/desktop': patch
---

undo says so when the record it would take back is gone: undoing the creation of a unit, contract, renewal, payment or complex that was deleted elsewhere is refused and never brings it back, deleting a record that no longer exists says so instead of reporting it deleted, and undoing a bulk deletion after its redo was partly refused puts back only what the redo removed. undoing the creation of a complex with no units no longer needs the permission to delete units
