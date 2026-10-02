---
status: resolved
blocked-by: [01]
---

# feat(desktop): the account section reads as sign-in and security

Blocked by: 01

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The account section is drawn on the shared blocks in the order requirement 8 gives: the ownership offer where one stands, signed in as, password, and a last group whose one row is *sign out of this machine*, moved out of `identity.svelte`, in the error tone and not confirmed. *Sign out of other machines* stays as it is until ticket 09 replaces it with the machines group.

## Acceptance Criteria

Traces requirements 1, 2 and 8, and criteria 1, 2 and 8 for the account section.

- [x] Account's groups appear in the order of requirement 8, with sign out of this machine last, in the error tone, with its icon, and opening no confirmation. *Verified: `vitest run app/tests/settings-area.svelte.test.ts organization/session/tests` printed 4 files, 48 passed: the order assertions end in `data-sign-out`; the last of five groups holds one error-toned row with an svg; its press fires the sign-out once and opens no dialog.*
- [x] Every row has an icon and a name; within each group buttons all carry an svg or none do. *Verified: the same run: every `[data-settings-row]` has an svg and a name, each group's buttons agree on svgs, and error rows are last in their group.*
- [x] The rail's account menu still signs out, and its behaviour is unchanged. *Verified: the same run: the unmodified rail account menu's sign-out item fires the event once and opens no dialog.*

## Relevant areas

- `apps/desktop/src/lib/organization/component/settings-account.svelte`
- `apps/desktop/src/lib/organization/session/component/{identity,change-password-dialog,end-other-sessions}.svelte`
- `apps/desktop/src/lib/app/tests/settings-area.svelte.test.ts`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
