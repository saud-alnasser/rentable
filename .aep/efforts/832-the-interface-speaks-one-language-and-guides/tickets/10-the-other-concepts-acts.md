---
status: resolved
blocked-by: [09]
---

# refactor(desktop): tenant, complex, unit and payment acts are declared once

## Outcome

Tenant, complex, unit and payment each declare their acts in `<concept>/acts.ts` and run them
through a host mounted in the frame, as contract does. Their cards and pages offer the same set in
the same order, copy details included. A unit's page offers edit and delete.

## Acceptance Criteria

Traces requirements 8 and 14 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criteria 8 and 14(d).

- [x] `tenant/acts.ts`, `complex/acts.ts`, `complex/unit-acts.ts` (or `unit/acts.ts` under the
      complex, per `[[rules/module-layout]]`) and `payment/acts.ts`, each with a host in the frame.
      The forms and delete dialogs mounted by `*/directory.svelte`, `*/details.svelte`,
      `complex/component/unit-directory.svelte` and `payment/component/ledger.svelte` move into the
      hosts. Verified: tenant, complex, `complex/unit` and payment each have `acts.ts` and a host mounted in `frame.svelte`; on the merged tree a grep for the forms and `<DeleteDialog` under `src/lib` finds them only in the hosts, their own form files, and organization dialogs (ticket 11).
- [x] The node projection test from ticket 09 covers all five concepts. Verified: `design/tests/acts.test.ts` covers all five concepts; desktop node 1043 of 1043 on the effort branch.
- [x] `complex/component/unit-details.svelte` offers edit and delete. Verified: `unit-details.svelte` renders copy details, edit and delete from the unit acts, pinned by its test; vitest 254 of 254.
- [x] The command menu lists each concept's acts through the palette's asking mode.
 Verified: each concept in `layout/record-search.ts` lists its acts and hands them to its host; read from the code; `pnpm check` 0 errors.
## Relevant areas

- `apps/desktop/src/lib/tenant/component/directory.svelte:143`, `details.svelte:64-87`
- `complex/component/directory.svelte:128`, `details.svelte:89-112`, `unit-directory.svelte:146`,
  `unit-details.svelte:25-38`
- `payment/component/ledger.svelte:200`, `details.svelte:56-89`

## Constraints

- The shape is ticket 09's. Nothing here changes `RecordAct`. If a concept needs a field the type
  lacks, stop and raise it.
