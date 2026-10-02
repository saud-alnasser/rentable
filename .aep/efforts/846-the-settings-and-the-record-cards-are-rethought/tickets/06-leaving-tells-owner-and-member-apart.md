---
status: open
blocked-by: [05]
---

# feat(desktop): leaving tells owner and member apart

Blocked by: 05

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The leaving group shows a member *disconnect this machine* with its consequence line, and an owner *hand over ownership* first, then disconnect, then *delete organization* last and set apart. Hand over is projected from the member act declaration and runs through the member host, as the plan's *Hand over ownership in the leaving group* says; its condition moves from `appliesTo` to `unavailable`, so it is shown refused with its reason where nobody can take it yet.

## Acceptance Criteria

Traces requirements 2 and 14, and criterion 14.

- [ ] As a member, the group holds disconnect alone, with its icon and consequence line.
- [ ] As an owner, the group holds hand over, disconnect, delete, in that order; disconnect and delete are error-tone end rows; delete states nothing undoes it.
- [ ] Pressing hand over calls `memberHost.run('member.offerOwnership', record)` (a spy), and opens the existing offer form.
- [ ] `member.offerOwnership` with nobody offerable is shown refused with *nobody has set a password yet* on the owner's card and in the leaving group; `act/tests/act.test.ts` passes.

## Relevant areas

- `apps/desktop/src/lib/organization/component/{settings-organization,disconnect,disconnect-dialog,delete-organization}.svelte`
- `apps/desktop/src/lib/organization/member/acts.ts`, `apps/desktop/src/lib/organization/host.svelte.ts`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
