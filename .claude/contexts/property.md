# Property

Sources: `src/lib/complex/`

The physical things being rented: the buildings, and the spaces inside them.

## Language

**Complex**:
A named building or property at a location. Owns units.

**Unit**:
A rentable space within a complex. Carries a status of `occupied` or `vacant`.

## Boundaries

- **Nothing writes unit status directly.** It is derived from the unit's assignments and
  written back by reconciliation; the rule that computes it belongs to the contract
  context, because occupancy is a question about contracts.
- **A unit belongs to exactly one complex**, and a complex owns its units — deleting either
  is constrained by what still references it.
