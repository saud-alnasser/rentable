---
status: resolved
---
# fix(desktop): create asks for + where a unit is still in the entry

The spec is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]]; the approach is [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/plan]]. Both are authoritative over this ticket.

## Outcome

Asked by the human on 2026-09-30, after ticket 76: "why create acts as a + in the complex new record, why not required of the user to add the plus if there's data in it". Their choice, from three offered: stop and point to +. A unit name still in the entry when Create is pressed (on a new complex, and on units being added to one, which share the entry) stops the press: nothing is written or moved, focus goes to the entry, and the line under it says "add this unit with + first, or clear it." (`complexes.form.unitNotAdded`, in `en` and `ar`). Clearing the entry takes the line away, as + does. The changeset ticket 76 added is rewritten to say what the form now does.

## Acceptance Criteria

Traces requirement 19 of [[efforts/840-a-feature-plugs-in-and-lives-in-one-place/spec]].

- [x] Create with a unit still in the entry writes and moves nothing, focuses the entry and asks for +; clearing the entry takes the line away. Verified: `complex/tests/form.svelte.test.ts` "a unit still in the entry stops Create and asks for +, and nothing moves"; on the running app, "ZZ plus check" with "ZZ-7" typed stayed open on Create with the entry focused and the line shown, and after + the next Create wrote it with 1 unit (removed afterwards).
- [x] + lists the unit and readies the entry. Verified: "a unit added with + is listed, and the entry is ready for the next".
- [x] The integration gate passes on this commit. Verified: `pnpm check` 0, `eslint .` 0, `prettier --check .` 0, `turbo run test --concurrency=1` 0 (desktop `pass 1433`, design `pass 159`, permission `pass 23`, `fail 0` each), `build:web` 0.

## Relevant areas

- `src/lib/complex/unit/component/entry.svelte`, `src/lib/complex/component/form.svelte`, `src/lib/complex/i18n/`, `src/lib/complex/tests/form.svelte.test.ts`

## Constraints

- One commit, and it passes the integration gate alone ([[rules/version-control]]).
