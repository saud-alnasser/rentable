---
status: implemented
---

**The map is [#624](https://github.com/saud-alnasser/rentable/issues/624)**, and its sub-issue
list — not this file — carries live ticket state. The one build ticket cut under it is
[#562](https://github.com/saud-alnasser/rentable/issues/562), reshaped from the report that
found the defect. This repository is branch-bound, so tickets are GitHub issues rather than
files beside this spec ([[rules/tracker]]).

# fix(workspace): a contract keeps its units through a transfer

## Problem

A workspace whose contracts hold units cannot be handed over. `workspace.importWhole` refuses
the whole file the moment any contract names one, so the operator on the second machine gets
nothing: not a partial workspace, not a workspace missing its assignments, nothing.

The refusal is a key mismatch, and it is one line wide. The router builds its unit map under
two values and looks it up under one:

```ts
unitIds.set(toTransferKey(unit.complex, unit.name), id);   // router.ts:286, :311
unitId: resolve(unitIds, unit, 'unit')                     // router.ts:348
```

`toTransferKey` is `toImportIdentity`, which is `JSON.stringify(values.map(comparable))`. Two
arrays of different length never compare equal, so the lookup can never hit — `["al nakheel",
"a1"]` against `["al nakheel / a1"]` — and every assignment reaches `resolve`'s refusal instead
of its map.

The cost is the whole of what [[efforts/work-the-surfaces-cannot-do]] built the seam for. Its
criterion 7 says a file exported from a directory imports back into it, and the round-trip test
that certified it compared `[]` against `[]`: the fixture asked for an assignment by passing
`unitIds` to `contract.create`, whose input schema is `ContractSchema.omit(...)` with no such
key, so zod stripped it and no assignment row was ever written. The criterion was met
vacuously. Removing that dead key in #561 changed no behaviour; it made the line honest and
left the gap visible.

*Reported as [#562](https://github.com/saud-alnasser/rentable/issues/562), found while
reviewing #561 and reproduced by a second reader. Pre-existing: #561 is what made it visible.*

## Goal

A workspace exported from one machine imports into another with its assignments intact, and the
round-trip test seeds an assignment so this cannot go quiet again.

## Scope

The unit lookup in `workspace.importWhole`, and the round-trip fixture that failed to exercise
it.

## Requirements

1. An import resolves a contract's unit references under the same rule the planning pass
   resolves them under, so a file carrying assignments is written rather than refused.
2. The round-trip fixture seeds a contract that actually holds a unit, so the assignment path is
   exercised by the test that claims to cover it.

## Acceptance Criteria

1. Importing a workspace file whose contract names `Al Nakheel / A1` writes the assignment row,
   and `workspace.get` on the target reads that contract back holding that unit. *(R1)*
2. The round-trip fixture assigns its units through `contract.units.set`, and the round-trip
   assertion compares a non-empty `units` array on both sides. *(R2)*
3. A unit reference the workspace cannot answer for is still refused exactly as before, naming
   the reference as a person wrote it. *(R1)*

## Constraints

- **The planning pass decides what a reference means; the router only turns names into
  identities.** `workspace.ts`'s header says so, and the router's says so. The fix therefore
  goes at the lookup, which is the side that departed from the rule, not at the map. Keying the
  map under the composed reference would make the router a second answer to a question
  `planWorkspaceImport` already answers, and the two would be free to drift.
- **`toUnitParts` is the split, not a new one.** The planning pass already splits a composed
  reference before keying it (`workspace.ts:670`), at the *last* separator so a complex whose
  own name contains one still resolves. A second splitter written beside it is the drift this
  constraint exists to prevent.
- **What an unresolvable reference does is not being changed.** `planWorkspaceImport` records it
  as unresolved, drops the contract row, and refuses a multi-sheet file whole. The router's
  `resolve` throw is the last-resort guard behind that, matching the guards on tenants,
  complexes and contracts. #562 filed this as undecided; the source had already decided it.
- **The test has to fail before it passes.** The bug is a silent one that a passing suite
  certified for two efforts, so the fixture change is made first and seen to fail
  ([[skills/tdd]]).

## Out of Scope

- **Reshaping `resolve` into something that cannot be miscalled.** A signature carrying the
  identity values rather than a display name would make this class of mismatch unrepresentable,
  and it touches four call sites in a file whose other three are correct. Raised, not taken.
- **The `unitIds` key that zod stripped.** `ContractCreateSchema` is right to omit it; assigning
  units is `contract.units.set`'s. Nothing here changes either.
- **Duplicate and collision handling on re-import.** An import into a workspace that already
  holds the contract is the planning pass's, and it is unaffected.
- **The status a unit carries after an import.** Derived by reconciliation, and already correct.

## Risks

- **The round-trip assertion may surface a second defect once an assignment actually exists**,
  since no test has ever compared a non-empty `units` array across the round trip. If ordering
  or reconciliation disagrees, that is a finding, not a licence to widen this change: it goes
  back to the tracker.
