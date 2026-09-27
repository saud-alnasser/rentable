---
status: open
---

# fix(desktop): the switches save what they show and foresee what a save refuses

## Outcome

Review round one of tickets 42 to 44, correctness. A member's card that changes the role and then
sets the same override the member had saves the role with no override, and says it saved. Picking a
role, and deleting one, move every flag of the override they clear, but only a reset is gated for
it. A role editor whose view switch a holder's override depends on is refused on save by a sentence
about the role, naming nobody. A new role opens on the member mask, which can hold switches its
maker cannot turn. After this, what the card shows is what it saves, and every one of these is
foreseen at its control with its reason.

## Acceptance Criteria

Traces requirement 7 and requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [ ] A role change sends the override the switches come to whenever it is not 0 (and the reader
      may override); a test changes the role, sets the old override again, saves, and finds it.
- [ ] Picking the member's saved role again restores their saved override on the card.
- [ ] Picking another role, and deleting a role, are refused at their control where clearing the
      override would move a flag the reader does not hold, naming the flag; tests cover both.
- [ ] In the role editor, turning a kind's view off is refused at the switch where a holder's
      override needs it, naming the holder, with the way on (reset them first); a test covers it.
- [ ] A new role opens on the member mask less the flags the maker does not hold.
- [ ] `pnpm check`, `pnpm test` and `pnpm lint` pass; `cargo test` passes.

## Relevant areas

- `src/lib/organization/component/host.svelte`, `member-sheet.svelte`, `member-role.svelte`,
  `role-editor.svelte`, `roles.svelte`, `permission-switches.svelte`, `src/lib/i18n`
