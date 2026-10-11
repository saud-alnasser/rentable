---
'@rentable/desktop': patch
---

editing a contract's dates no longer lets a renewal start on or before the day the contract it renews ends, from either side: moving the renewal's start back, or the renewed contract's end forward past a renewal still in place, is refused as renewing is, so a renewed contract stays renewed after a workspace export and import
