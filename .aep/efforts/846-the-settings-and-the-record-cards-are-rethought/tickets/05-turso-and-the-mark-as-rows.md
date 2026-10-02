---
status: resolved
blocked-by: [04]
---

# feat(desktop): the Turso account reads as a connection, and the mark as a row

Blocked by: 04

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The owner's Turso group is one row naming the connection and its state on this machine, connected or not held here with an icon-bearing reconnect, and *forget Turso account* as its error-tone end row, confirmed with the revoke sentence it has today. The signature or seal group is a row with its preview, choose or replace, and *remove* as its end row, now confirmed.

## Acceptance Criteria

Traces requirements 2, 5 and 13, and criteria 2, 5 and 13.

- [x] Owner whose machine holds the authority: the Turso row reads connected; forget is last, error tone, with an icon, and its confirmation names where to revoke the token. *Verified: `vitest run app/tests/settings-area.svelte.test.ts setup/tests/turso-account.svelte.test.ts tests/mark.svelte.test.ts` printed 3 files, 52 passed; "an owner holding the authority reads the turso account as connected, and forget last" finds the error-toned end row with its icon and the confirmation naming app.turso.tech.*
- [x] Owner whose machine does not: the row reads not held here, with reconnect carrying an icon; the pending and failed callouts sit under the row. *Verified: the same run: the not-held row reads not held here, reconnect carries `plug`, and the turso-account test finds the pending line and both callouts under the row (through the new `beneath` slot; design block tests 113 passed).*
- [x] The mark's remove is the group's end row, error tone, with an icon, and is confirmed before the mark is removed. *Verified: the same run: `mark.svelte.test.ts` finds remove as the end row, error tone with `trash-2`, and cancelling the dialog removes nothing.*
- [x] No button in either group lacks an icon where another in the same group has one. *Verified: the same run: "the turso and mark groups agree on glyphs within each group", held and not held, and the mark test's two buttons.*

## Relevant areas

- `apps/desktop/src/lib/organization/component/{settings-organization,mark}.svelte`
- `apps/desktop/src/lib/organization/setup/component/{forget-account,reconnect-authority}.svelte`
- `apps/desktop/src/lib/app/tests/settings-area.svelte.test.ts`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
- Blocked by 04 only because both edit `settings-organization.svelte`.
