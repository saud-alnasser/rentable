---
status: resolved
blocked-by: []
---

# fix(desktop): every ending act's confirmation says what brings it back

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Converge round one, gap D, and two stale strings. Requirement 2 asks each confirmation to state what ends and whether anything brings it back: forget the Turso account (reconnecting with the Turso consent brings it back) and sign out all other machines (each signs in again with the password) say so in English and Arabic. `standing.reconnectBelow` no longer says *the block below*, which a grid does not guarantee, and the area's comment naming a transfer beneath the workspaces directory is corrected.

## Acceptance Criteria

Traces requirement 2 and criterion 2.

- [x] The forget and sign-out-all confirmations each name what brings it back, in both locales; their tests read the sentence. *Verified: `node --test i18n/tests/organization.test.ts` passes, reading in en and ar that reconnecting the Turso account brings it back and that the password signs each other machine in again; the turso-account, machines and area component tests read the new en sentences.*
- [x] No string or comment refers to a block below or a transfer beneath the directory. *Verified: `grep -rniE 'block below|transfer beneath' apps/desktop/src` outside the generated types printed 0 lines; `reconnectBelow` became `reconnectOnAccount`.*

## Relevant areas

- `apps/desktop/src/lib/organization/` (i18n, setup, session components), `apps/desktop/src/lib/settings/component/area.svelte`

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
