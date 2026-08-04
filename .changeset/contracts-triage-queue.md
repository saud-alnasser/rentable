---
'rentable': minor
---

the contracts list opens as a queue rather than a grid of cards. contracts are grouped by what needs you first — defaulted, then active, then scheduled, with fulfilled, expired and terminated below them — and inside each group the soonest end date leads. a row carries the tenant, how much of the contract has been paid, and when it ends, and opens the contract.

searching runs in the database now instead of over everything already loaded. it still finds a contract by government id, phone, cost or interval even though a row no longer shows those, and a search containing % or _ looks for those characters rather than treating them as wildcards. the whole list arrives at once, so there is no more loading as you scroll.

progress bars fill from the right in arabic, where they used to fill from the left.
