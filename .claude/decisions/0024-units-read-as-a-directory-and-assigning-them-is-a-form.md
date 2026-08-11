---
owner: repository
status: accepted
load-when: a unit is being listed, or units are being assigned to a contract
sources: [src/lib/complex/component/, src/lib/contract/component/]
supersedes: []
superseded-by: []
---

# Units read as a directory, and assigning them is a form

[ADR 0013](0013-list-presentation-is-per-concept.md) gave units an occupancy board, and units
inside a contract were never a list at all — they were a bespoke panel that assigned units and
listed the assigned ones in the same surface. So one concept read two ways depending on which
tab was opened, and neither was the shape the other records use. **Units now read as directory
rows wherever they appear, and assigning them to a contract is a form on the shared form
surface.** The read half converges because a unit met in a complex and a unit met in a contract
are the same record; the write half moves because a panel that writes, embedded in a surface
that reads, is exactly the case
[ADR 0020](0020-surfaces-diverge-by-kind-not-by-operation.md) draws its line through.

This overrides ADR 0013's unit assignment **and nothing else about it**: the shell-and-snippet
seam, the four other presentations, and the rule that a shape is chosen by what the data is for
all stand. It is recorded in prose rather than through the supersession fields, following
[ADR 0019](0019-the-work-queue-is-the-landing-screen.md), which overrode 0013's contract
assignment the same way — a partial override claimed in the field would read as though the
other four presentations had been retired with it.

## Consequences

**The occupancy board is retired, and what it encoded has to survive the move.** The board said
occupancy through the tile itself — a dashed border for a vacant unit, a solid card for an
occupied one — alongside the status and the occupying tenant's name. A directory row states
those in the vocabulary every other row uses; a row that drops the occupying tenant has lost the
question the board existed to answer.

**Assignment's rules do not move with its surface.** What locks assignment — a terminated
contract, a contract with a payment already recorded — belongs to the contract module and is
enforced by the procedure. The form is a caller like any other, and the end-to-end tests over
those refusals are what say the move kept them.

**A unit row now has somewhere to go.** A directory row with a detail view navigates on click,
which is what makes a unit view worth having and is why the two land together rather than
separately.

**This is a shape chosen twice, differently.** The board was picked deliberately over a
directory the first time, on looking. If the directory turns out to answer "who is in what"
worse than the board did, the honest response is a third ADR rather than a quiet reversion —
the reasoning above is the whole of what was weighed, and it was weighed against a request
rather than against a rendering.
