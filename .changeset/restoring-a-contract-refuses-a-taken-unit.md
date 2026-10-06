---
'@rentable/desktop': patch
---

restoring a terminated contract, or undoing its termination, is now refused when another contract has taken one of its units over the same dates since, and the refusal names the unit, so a unit is never held by two live contracts at once. restoring several together says how many were turned away for this, and two terminated contracts on one unit restore one and not the other.
