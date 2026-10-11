---
'@rentable/desktop': patch
---

importing a workspace file no longer lets a Renews entry link a renewal that could not have been made: an entry naming a contract that ends on or after the renewal starts, or one another renewal already continues, is skipped without turning the row away, so an edited file cannot make two contracts renew each other or give one contract two renewals
