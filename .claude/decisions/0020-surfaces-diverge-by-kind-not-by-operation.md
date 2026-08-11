---
owner: repository
status: accepted
load-when: a new surface for a concept is being placed
sources: [src/lib/design/block/]
supersedes: []
superseded-by: []
---

# Surfaces diverge by kind, not by operation

[#250's prototype](../evidence/prototypes/contract-queue-group-header.md) closed with a fourth
question nobody had recorded an answer to: *do a concept's surfaces diverge per operation —
create, edit, delete — or only for the list?* The answer is already implied by two accepted
decisions read together, and is written down here because neither states it and the reviewer
was not certain it had ever been settled. **A surface that reads a concept's records takes that
concept's own shape ([ADR 0013](0013-list-presentation-is-per-concept.md)); a surface that
writes them takes the one shared form surface
([ADR 0017](0017-a-form-surface-is-one-component.md)); a surface showing the application's own
state takes the shared one too ([ADR 0015](0015-the-applications-own-surfaces-converge.md)).**
The axis is the *kind* of surface, never the operation: create and edit are one surface because
they write, not because they are adjacent verbs.

## Consequences

**A new surface is placed by asking what it does, not which concept it belongs to.** The three
tests do not overlap and every surface meets exactly one, so there is no case where two of them
compete for the same screen.

**Delete is not a fourth case.** It is a confirmation over a record, not a form, and it stays
the shared dialog it already is — recorded here because "one surface per operation" would
predict otherwise and the prototype's question was asked in exactly those terms.

**The read/write line is what lets a queue row open a write surface.** The landing screen's
queue reads contracts and its rows open the payment form
([ADR 0019](0019-the-work-queue-is-the-landing-screen.md)) — a read surface of one concept
reaching a write surface of another. That is not a boundary crossing this decision has to
excuse, because the form is shared and belongs to neither.

This is the one decision in this session that was not grilled. It is the synthesis of three that
were, and it was accepted as such rather than argued on its own terms — worth knowing if it ever
turns out to be wrong, because the reasoning above is the whole of what was weighed.
