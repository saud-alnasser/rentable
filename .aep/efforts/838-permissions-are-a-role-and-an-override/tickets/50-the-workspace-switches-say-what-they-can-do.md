---
status: open
blocked-by: [49]
---

# fix(desktop): the workspace switches offer only what they can do, and say it

## Outcome

Review round one of tickets 48 and 49. A reader holding a workspace read only can switch a member
out and then not back in, though that writes nothing. The lock is offered to an owner whose machine
has not the Turso authority, and the save is refused. The lock's line is not read with it and reads
as done before it is. The dialog's save carries the key glyph, its empty line names workspaces for
a list of people, its act is hidden where the card's section is refused, members share the tenant's
glyph there, and the read-only act has two names. After this each is as the criteria say.

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [ ] Switching a row back to what it held is never refused; a test switches a full-access member
      out and in as a reader holding the workspace read only, and nothing is written.
- [ ] The lock is offered only where the reader is the owner and this machine holds the Turso
      authority; otherwise it is dimmed with the reason. `canGrantReadOnly` means that at every
      caller and its doc says so.
- [ ] The lock's line is tied to the lock by `aria-describedby` and says what locking does.
- [ ] The dialog's save carries the save glyph, its empty line names people, and the workspace
      card's act that opens it is refused with its reason rather than hidden.
- [ ] Members are drawn with a glyph of their own, not the tenant's; one name for the read-only act
      in both languages; "the owner's Turso account" where prose says whose account; the i18n
      test comment and the plan agree with the spelling in use; `acts.ts`'s member.edit doc says
      what the sheet draws.
- [ ] Tests in English and Arabic; `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `src/lib/organization/component/access-switches.svelte`, `access-dialog.svelte`,
  `host.svelte`, `account-form.svelte`, `acts.ts`, `layout/component/organization-dialogs.svelte`,
  `src/lib/i18n`, `.aep/rules/interface.md`, the effort's `plan.md`
