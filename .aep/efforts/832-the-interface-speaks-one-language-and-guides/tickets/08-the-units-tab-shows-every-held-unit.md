---
status: resolved
---

# fix(contract): the units tab shows every unit the contract holds

## Outcome

A contract's units tab lists every unit the contract holds, including one that another contract
with an overlapping term also holds. So the count a delete refusal reports is the count the tab
shows.

## Acceptance Criteria

Traces requirement 20 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 20(c).

- [x] `contract.units.getAssignableMany` never drops a unit the contract itself holds: the conflict
      filter keeps a unit whose assignment names this contract. Verified: router test "the held pane lists a unit an overlapping contract also holds" asserts `isAssigned: true`; it failed before the fix ("a unit the contract holds was dropped") and passes on the effort branch (pass 1, fail 0).
- [x] A router test builds a contract holding a unit that a second, overlapping contract also
      holds. It asserts the unit is listed with `isAssigned: true`, and that `units.getMany` and the
      held pane agree on the count. Verified: the same test builds the overlap through terminate, a second contract and unterminate, and asserts the held pane length equals `units.getMany`; `router.test.ts` pass 97, fail 0.
- [x] The delete dialog's blocker count for that contract equals the held pane's length (component
      or router-level assertion). Verified at router level in the same test: `contract.delete` refuses with /associated units/ and `units.getMany` has length 1, equal to the held pane; both dialogs count from `units.getMany`.

## Relevant areas

- `apps/desktop/src/lib/contract/router.ts` (`getAssignableMany` around `:1224`, the `.filter` on
  `conflictingUnitIds`), `contract/component/units.svelte:54-56`,
  `contract/component/details.svelte:71` and `actions.svelte:99` (blockers from `units.getMany`)

## Constraints

- The available pane still hides units an overlapping contract holds. Only the held pane changes.

## Notes

Found on 2026-09-24 in the prototype run on the seeded workspace: a contract's delete was refused
for units its tab did not show. The human folded it into this effort.
