---
status: open
blocked-by: []
---

# feat(desktop): a machine is signed out from its row's menu

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Converge round one, gap A, decided by the human on 2026-10-02 ("Move it off the rows"). Each other machine's row in the account's machines card carries the record menu (the components context's *a secondary act on a record*) holding *sign out this machine*, confirmed as today and naming the machine; a machine that has not run this version shows it refused with its reason, and *sign out all other machines* stays the one error-tone act, last in the card.

## Acceptance Criteria

Traces requirements 2 and 10 as decided 2026-10-02, and criteria 2 and 10.

- [ ] `machines.svelte.test.ts`: no row carries an error-tone button; each other machine's row has a menu control named for it whose item signs it out after the confirmation naming it; this machine's row has no sign-out; a not-updated machine's item is refused with its reason.
- [ ] The area test finds *sign out all other machines* the only error-tone act in the machines card, and last.

## Relevant areas

- `apps/desktop/src/lib/organization/session/component/machines.svelte` and its tests

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose the menu by [[contexts/desktop/components]].
