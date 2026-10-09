---
status: resolved
blocked-by: [09]
---

# feat(desktop): renewing records the link and may change the rent

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]], and [[efforts/861-the-app-never-shows-something-false/plan]] (*Components, `contract/renewal/router.ts`, `contract/component/form.svelte`; Interfaces, `contract.renew`*).

## Outcome

`contract.renew` takes the rent, writes the successor's link to the predecessor, refuses a contract already renewed, and the renew form offers the rent filled with the predecessor's.

## Acceptance Criteria

Traces requirement 5, requirement 8, criterion 5 (renew, undo and redo) and criterion 8.

- [x] A renewal's successor stores the predecessor's id; undoing then redoing it restores the same link and rent under the same id. Verified: `node --test contract/renewal/tests/*.test.ts api/tests/undo.test.ts`: 74 pass, 0 fail; the successor's `renewsContractId` is the predecessor's id, and renew, undo, redo restores the same id, link and rent, through the router and the real undo stack.
- [x] Renewing at a different rent creates a successor with that rent, and the predecessor's row is unchanged; renewing without touching the rent keeps the old one. These replace the copied-cost pin in `renewal/tests/router.test.ts`. Verified: the same run: a rent of 2750 reaches the successor with the predecessor's row and payments identical before and after; sending the old rent keeps it; the copied-cost pin is replaced.
- [x] Renewing a contract a live successor already renews is refused with `contract.alreadyRenewed`, worded in both locales. Verified: the same run: a live successor is refused `contract.alreadyRenewed` with nothing written; a terminated, retired or deleted successor allows renewing again; worded in `contract/i18n/en.ts` and `ar.ts`.
- [x] The form enables the cost field in renew mode and sends it; `renewDescription` in both locales says the rent may change; the comments in `renewal/router.ts` and `renewal/renewal.ts` that ruled cost and lineage out are rewritten. Verified: `vitest run contract/tests/renew-form.svelte.test.ts`: 3 of 3 pass (enabled and prefilled, a changed cost sent, an untouched one sent as the old rent); `renewDescription` reworded in both locales; the comments in `renewal/router.ts` and `renewal/renewal.ts` rewritten.

## Relevant areas

- apps/desktop/src/lib/contract/renewal/router.ts, renewal.ts, query.ts, tests/
- apps/desktop/src/lib/contract/component/form.svelte, contract/form.ts, contract/refusal.ts, contract/i18n/

## Constraints

- Write the failing test first, at the level [[rules/testing]] fixes ([[skills/tdd]]).
- The interval, tenant and units stay the predecessor's.
- A changeset for `@rentable/desktop` in a user's words rides in the same commit ([[references/changesets]]).

## Notes
