---
status: open
blocked-by: [13]
---

# feat(desktop): a locked member views only, wears a badge, and is unlocked from their card

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]], and [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/plan]] (*A new member starts locked*, the enforcing and the card).

## Outcome

A locked session views what its role allows and draws every write control dimmed with the locked reason; its record writes are refused by the procedures; a sentence says the account is locked until an owner or a manager unlocks it. The directory shows a locked badge on a locked member's card, and the unlock, with a confirmation, to those who may unlock once the member has set a password; before that the card says the member has not signed in yet.

## Acceptance Criteria

Traces requirements 32 (the frontend half), 33 and 34 (the frontend half), and criteria 32 (the component half), 33 and 34 (the component half).

- [ ] `permissionsIn` masks a locked session's permissions to the view flags, so every `procedure.permitted` record write refuses and every control keyed on a write flag is drawn dimmed with the locked reason. A component test of a record list under a locked session draws every write control dimmed with that reason, and a test of a procedure refuses a record write (criterion 32).
- [ ] The locked sentence shows for a locked session where the workspace is drawn, in English and Arabic, and disappears once the session reads unlocked.
- [ ] `card.svelte` draws a `locked` outline badge beside the existing footer badges for a locked member and none for an unlocked one (criterion 33).
- [ ] `acts.ts` gains `canUnlock`; the unlock is drawn for the owner and an outranking holder of `AssignRole` or `OverrideMember`, never on the reader's own card, only once the member's password is set, and opens a confirmation before calling `member_unlock`; before the password is set the card says the member has not signed in yet (criterion 34).
- [ ] Every new string in English and Arabic, lower case per the i18n rule; a changeset.

## Relevant areas

- `apps/desktop/src/lib/api/{context.ts,trpc.ts}`, `src/lib/organization/member/{acts.ts,component/card.svelte,component/directory.svelte,component/sheet.svelte}`
- the workspace shell where a notice can sit; [[contexts/desktop/components]] for the badge and the confirm

## Constraints

- Choose components per [[contexts/desktop/components]]; follow Apple's HIG first, then [[rules/interface]].
- No new flag; the lock is its own fact, not a role.
