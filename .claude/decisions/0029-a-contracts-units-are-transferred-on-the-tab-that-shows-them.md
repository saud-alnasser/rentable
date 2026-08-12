---
owner: repository
status: accepted
load-when: a contract's units are being assigned, or a writing control is being put on a reading surface
sources: [src/lib/contract/component/]
supersedes: []
superseded-by: []
---

# A contract's units are transferred on the tab that shows them

[ADR 0024](0024-units-read-as-a-directory-and-assigning-them-is-a-form.md) put assignment on
the shared form surface, reached from the units tab by the list shell's create control. That
control is a `+`, which promises to add a unit, and what it opens chooses the contract's whole
set in both directions — so the only way into the surface describes a different operation than
the surface performs. **The tab that lists a contract's units now holds both panes and performs
the transfer itself; the assignment dialog is removed.** Entering the surface is being on the
tab, so there is no affordance left to name wrongly.

## Considered Options

- **Rename the entry control and keep the dialog** — the smallest fix, and it makes the
  affordance honest without touching either earlier decision. Rejected by the user in favour of
  the tab; recorded because it is what a later reader will propose first, and because it remains
  the way back if the panes do not work out.
- **Commit the whole transfer on an explicit save** — one write, one reconcile and one undo
  entry for a session of shuffling, against one of each per transfer. Rejected because unsaved
  state on a tab a reader can navigate away from needs dirty tracking, a discard affordance and
  a leave guard, which costs more than the writes it saves on a surface whose point was to stop
  being a mode.

## Consequences

**This overrides ADR 0024's write half and nothing else about it.** The read half — that a unit
reads as a directory row wherever it is met — is what this depends on, since both panes are
directory rows. It is recorded in prose rather than through the supersession fields, following
[ADR 0019](0019-the-work-queue-is-the-landing-screen.md) and ADR 0024 itself, both of which
overrode part of [ADR 0013](0013-list-presentation-is-per-concept.md) the same way: a partial
override claimed in the field would read as though the whole decision had been retired.

**[ADR 0020](0020-surfaces-diverge-by-kind-not-by-operation.md) gains its first exception, and
it is narrow.** Its rule is that a surface writing a concept's records takes the shared form
surface. That still holds for creating and editing a unit, a contract, a tenant, a complex and a
payment — every form in the application is unmoved. What is excepted is a surface whose whole
content is one relation between two record sets, where the reading and the writing are the same
gesture and separating them produces the mislabelled door this decision removes. A new surface
does not reach for this exception because it happens to write from a tab; it reaches for it only
where the two panes *are* the reading.

**Each transfer commits on its own, and the row landing in the other pane is the confirmation.**
No message is raised per transfer, because a surface that announces what the reader just watched
happen is noise. The cost is a reconcile per transfer rather than per session — bounded, and
measured at 2.6 ms on a realistic database — and an undo entry per transfer rather than one for
the set, which is the more useful granularity anyway.

**A pane row still opens its unit.** [ADR 0025](0025-a-row-opens-its-record-and-does-nothing-else.md)
is untouched: the transfer is an explicit control on the row, which is exactly what that decision
permits, and a reader who clicks a row in either pane gets the unit's page as they would anywhere
else.
