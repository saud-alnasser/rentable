---
status: resolved
---
# fix(desktop): a complex's form keeps what was typed, and needs a name

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Found by the human on the running app, 2026-09-30: with a unit name typed into a new complex's entry and plus not pressed, Create moved the unit onto the list, as it should, and also emptied the name and location; a second Create then wrote a complex with no name and only units. Two faults, both older than the effort (`main` has the same form). Superforms resets a form after every submit it counts as valid, and the press that only collects the entry is one, as is a refusal said as an announcement; so every form on the shared surface emptied itself whenever it stayed open. `surfaceForm` now sets `resetForm: false` (every such form loads or resets its fields when it opens), and the contract's and complex's own copies of the setting go. The complex form requires a name (`complexes.form.nameRequired`, in `en` and `ar`). Fixed here because it blocks the running-app checks; a patch changeset rides with it.

## Acceptance Criteria

Traces requirement 19 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]].

- [x] Create with a unit still in the entry adds it to the list, writes nothing, and keeps the name and location. Verified: `complex/tests/form.svelte.test.ts` "a unit still in the entry joins the list on Create, and the name and location stay" fails on the old form and passes; on the running app, "ZZ form check" with "ZZ-9" typed and plus not pressed kept its name and location on Create, listed the unit, and the second Create wrote the complex with 1 unit (removed afterwards).
- [x] A complex without a name is refused on its name. Verified: "a complex with units and no name is refused on its name" fails on the old form and passes; on the running app, a unit and no name showed "give the complex a name." under the name field and wrote nothing.
- [x] No other form's behaviour moves except keeping what was typed. Verified: every form spreading `surfaceForm` (tenant, unit, contract, payment, complex, account, workspace rename) sets or resets its fields when it opens; the contract form already set `resetForm: false`.
- [x] The integration gate passes on this commit. Verified: `pnpm check` 0, `eslint .` 0, `prettier --check .` 0, `turbo run test --concurrency=1` 0 (desktop `pass 1433`, design `pass 159`, permission `pass 23`, `fail 0` each), `build:web` 0.

## Relevant areas

- `src/lib/form/form.ts`, `src/lib/complex/component/form.svelte`, `src/lib/contract/component/form.svelte`, `src/lib/complex/i18n/`, `src/lib/complex/tests/form.svelte.test.ts`

## Constraints

- One commit, and it passes the integration gate alone ([[rules/version-control]]).
