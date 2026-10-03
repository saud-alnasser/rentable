---
status: resolved
blocked-by: [01]
---

# feat(desktop): a workspace card says it is open, who holds it and what you may do

Blocked by: 01

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Each workspace card keeps the disc and adds *open on this machine* in words, the member count with its icon, and the reader's own access worded as what they may do, from the session's workspace entry, as the plan's *The workspace card* gives it. The directory's heading takes the group's treatment and keeps its tray.

## Acceptance Criteria

Traces requirements 1 and 16, and criterion 16.

- [x] `organization/workspace/tests/directory.svelte.test.ts` finds *open on this machine* on the open card only, the member count on every card, and the access word for full access, read-only, pinned and owner. *Verified: `vitest run organization/workspace/tests/directory.svelte.test.ts` printed 30 passed: the open words on the open card only, a member count with an icon on every card, and the owner, edit, read (read-only grant, and a full grant under a view-only role) and set-for-you access words.*
- [x] No card uses the words *full access* or *no access*. *Verified: the same run: the test "no card says full access or no access" passes for an owner and a member.*

## Relevant areas

- `apps/desktop/src/lib/organization/workspace/component/directory.svelte`
- `apps/desktop/src/lib/organization/i18n/{en,ar}.ts`

## Constraints

- This is a user-visible change: it carries its own changeset ([[references/changesets]]).
- This reverses what effort 843 took off the card, at the human's choice of 2026-10-02; the directory's comment says so.
