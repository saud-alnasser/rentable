---
status: resolved
---

# fix(desktop): every record's trail runs through its parent, and the context says what is there

## Outcome

A unit's breadcrumb runs through its complex, as a payment's runs through its contract, so the
navigation rule's sentence holds for every record reached through another. A host's `run` refuses
an act whose `unavailable` names a reason, as the palette path already does. The repository
context names the application's design home as it now is. Found by converge round 1.

## Acceptance Criteria

Traces requirements 6 and 14 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]],
and its criterion 14.

- [x] `layout/navigation.ts` `RECORD_PARENTS` names the unit's complex; `navigation.test.ts`
      asserts the unit trail runs through its complex. Verified: `RECORD_PARENTS` maps the unit route to its complex and `unit-details.svelte` passes `parent`; `navigation.test.ts` expects place, parent, record; desktop node 1176 of 1176, vitest 364 of 364 on the merged tree.
- [x] Every concept host's `run` (and organization's `runDeclared`) checks `unavailable` as well
      as `appliesTo`, and a test pins it on one host. Verified: `mayRun` in `design/acts.ts` checks `appliesTo` and `unavailable`; all six concept hosts' `run` and organization's `runDeclared` use it; `payment/tests/host.svelte.test.ts` fails with the old check and passes with it.
- [x] `[[contexts/repository]]` no longer describes `list.svelte` as the only composite in the
      application's design home, and its block count is correct.
 Verified: `contexts/repository.md` names the design home's four block composites and its create, landing and list-motion modules, and counts 77 files.
## Relevant areas

- `apps/desktop/src/lib/layout/navigation.ts`, `complex/component/unit-details.svelte`, the
  concept hosts, `.aep/contexts/repository.md`
