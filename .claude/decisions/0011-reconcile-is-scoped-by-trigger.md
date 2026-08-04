# Reconcile is scoped by trigger: touched rows on mutation, whole table on time and sync

Reconcile loaded every contract, payment, unit and assignment on every mutation and at
startup — 40.7 ms and 2.6 MB per save at the baseline's stress scale, growing with history
forever — and ADR 0006 makes its output what the user sees, so it cannot simply run less.
It now splits **by trigger, never by rule**: a mutation reconciles only its touch-set — the
contract(s) it changed, their payments, their assignments, the units those assignments name,
and those units' other assignments — while the whole-table pass survives verbatim for the
three triggers that have no touch-set: application start, a UTC-day crossing noticed by a
periodic check while the app runs, and a remote-sync pull. The derivation functions stay
single-homed in TypeScript and unchanged, characterization-pinned behaviour included.

The argument that makes the scoped path safe: **time moves derived state only at UTC day
boundaries** (every date in the domain is a whole UTC day), and a mutation can only
invalidate the derived state of what it touched, given the last pass left everything else
correct. Trustworthiness therefore requires the full pass per day, per start, and per sync —
not per save.

## Considered Options

- **Whole-table on every trigger (status quo)** — one code path, and affordable at realistic
  scale (2.6 ms), but the save path carries a cost that grows with total history, and the
  interface-overhaul criterion "bounded by what the mutation touched" becomes unmeetable.
- **Whole-table off the save path** — mutations return before reconcile finishes; the list
  briefly renders pre-reconcile values, which is the filter/display disagreement ADR 0006
  was accepted to eliminate.

## Consequences

- A contract that expires while nothing is edited updates at the next day-crossing check or
  the next startup; the stale window is bounded by the check interval, at most one full pass
  per idle day.
- The scoped path's closure must include the touched units' *other* assignments — a unit's
  status reads every contract holding it. Bounded by touch, not by table.
- The overhaul's review criterion stands as written: no mutation path may read a whole table
  to reconcile.
