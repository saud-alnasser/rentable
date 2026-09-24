---
status: open
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

- [ ] `layout/navigation.ts` `RECORD_PARENTS` names the unit's complex; `navigation.test.ts`
      asserts the unit trail runs through its complex.
- [ ] Every concept host's `run` (and organization's `runDeclared`) checks `unavailable` as well
      as `appliesTo`, and a test pins it on one host.
- [ ] `[[contexts/repository]]` no longer describes `list.svelte` as the only composite in the
      application's design home, and its block count is correct.

## Relevant areas

- `apps/desktop/src/lib/layout/navigation.ts`, `complex/component/unit-details.svelte`, the
  concept hosts, `.aep/contexts/repository.md`
