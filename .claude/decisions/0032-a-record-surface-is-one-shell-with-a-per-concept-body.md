---
owner: repository
status: accepted
load-when: a surface showing one record is being built or changed, or where a record's chrome lives is in question
sources: [src/lib/design/block/, src/lib/contract/component/, src/lib/tenant/component/]
supersedes: []
superseded-by: []
---

# A record surface is one shell with a per-concept body

[ADR 0020](0020-surfaces-diverge-by-kind-not-by-operation.md) says a surface that reads a
concept's records takes that concept's own shape, and a reader who knows that line will read
a shared record surface as a contradiction. It is not one: the five record surfaces were
written by hand and hold a byte-identical loading state, a byte-identical not-found state
and the same header arrangement, so what is shared between them is **chrome and mechanism**
— the page frame, the back control, the action cluster, the title area, and holding a chosen
section in the address — and none of that is the shape of anybody's record. That moves into
one shell in the design module; **what a record's body looks like stays with the module that
owns the record**, which is 0020's line unchanged.

**A record's own fields are not one of its sections.** Every surface put them behind an
*Information* tab beside one or more tabs holding a collection — its contracts, its units, its
payments — and four of the five records have exactly one collection, so the switcher was
choosing between the record and the single list attached to it: a reader who opened a tenant
pressed a tab to see the tenant. The fields therefore read directly beneath the title area,
always, and **a section is a collection**. Four records show one and render it with no control
at all, the payment record shows none, and only the contract has two to choose between.

## Considered Options

**One component rendering every record from a declaration** — rejected for the reason
[ADR 0013](0013-list-presentation-is-per-concept.md) rejected it for lists: the configuration
grows to cover what markup says directly, and the contract record — a derived status, two
lifecycle actions, a ledger and a unit transfer — is where that shape breaks first.

**Shared pieces with five surfaces still assembling them** — a field cell, a header block, a
shared not-found state, composed per concept. The most literal reading of 0020, and it
unpicks the least. Rejected because keeping five assemblies identical stops being structural
and becomes discipline, which is what 0013 named when it rejected the same option.

## Consequences

**This narrows 0020 rather than overriding it, and 0020 stands otherwise.** The axis stays
the kind of surface; what this adds is that *chrome is not shape*, so a reading surface may
converge on shared chrome while its body stays the concept's. The same distinction is
already how the list block works — one shell owning query state, search, virtualization and
the empty state, with the concept supplying what one record looks like — so this is that
division applied one layer up rather than a new principle.

**A switcher appears only where there is something to switch.** The shell's mechanism is
choosing between collections, and on most records it is inert: four show one collection under
its own heading, the payment record shows none, and the control exists on the contract alone.
That is the opposite of a shape every record wears, and it is why the payment record needed no
special case in the end — a record with no collections is the same code path as one with one.

**A chosen section reaches the address only where a switcher exists.** Four concepts were
writing `?section=` and two were reading it back, so the tenant and unit records had been
pushing a query string nothing consumed. Under this the parameter belongs to the contract
alone. The `/contracts/units/<id>` route keeps working unchanged — it chooses a collection
where it used to choose a tab.

**Stacking every section down one scrolling page was rejected on a mechanism, not a taste.**
Each collection is a virtualized list that measures against a viewport with a bounded height
([ADR 0010](0010-lists-load-whole-result-sets.md) loads whole result sets, so virtualization
is what keeps a fifteen-thousand-row directory viable). Stacked sections take that bound away,
leaving each list an arbitrary fixed height inside a scrolling page — nested scroll regions,
and a direct hit on what the interface performance baseline measured.

**The line to watch is the action cluster.** A concept whose actions will not fit the seam
is the signal the shell is wrong, and the answer is a wider seam — not a second shell, and
not a concept quietly rebuilding the chrome beside it.
