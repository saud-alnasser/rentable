---
status: resolved
blocked-by: ['12']
---

# feat(organization): the owner deletes the organization

## Outcome

Under the sync section's authority block the owner can delete the organization: a confirmation
on the form surface names what goes and takes the owner's password; then every workspace
database and the organization database are deleted on the owner's Turso account, this machine
forgets the organization, and every other machine, finding the organization gone at its next
launch, forgets it too and lands on the first screen. Nobody but the owner sees the control.

## Acceptance Criteria

Traces requirement 18 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 18
and 12.

- [x] `sync/turso/platform.rs`: `DeletionIntent` gains `OrganizationDeletedByHuman`, and
      [[references/turso]]'s *Never run* names it as the third reason. `removal::delete_organization(store,
      session, platform, password, now)` is refused for anybody but the owner, re-opens the
      owner's vault with the password and refuses a wrong one before anything is touched, lists
      the workspaces from the replica, deletes each workspace database and then the organization
      database through `delete_database` with the new intent, forgets the organization on this
      machine as `disconnect` does and lets the consent go. Tests: as the owner, every workspace
      database and the organization database are deleted in that order with that intent and the
      machine holds nothing after; an administrator is refused with nothing deleted; a wrong
      password is refused with nothing deleted.
      *Verified 2026-09-16 on the effort branch: `DeletionIntent::OrganizationDeletedByHuman`
      in `platform.rs`, named in the Turso reference's *Never run* dated 2026-09-16;
      `removal::delete_organization` with
      `the_owner_deletes_every_workspace_then_the_organization_and_keeps_nothing` and
      `an_administrator_and_a_wrong_password_are_each_refused_before_anything_is_deleted` ok
      in `cargo test -- --test-threads=1` (`383 passed; 0 failed; 10 ignored`). Its signature
      is `(app_state, platform, password)`, since the forget needs the locks a `store` and a
      `session` would hold; see Notes.*
- [x] `forget.rs`: a machine whose launch pull is refused because the organization database no
      longer exists on the platform forgets the organization and lands on the first screen; the
      ticket establishes what libsql answers for a deleted database and keys the sign on it, or
      records in Notes that it cannot be told from a network fault and what a machine meets
      instead. A test pins whichever it is.
      *Verified: `platform::database_is_gone` matches a 404 alone, pinned against a loopback
      server answering 404, 401 and no status (`a_database_that_is_not_there` ok);
      `forget::forget_deleted_organization` runs once a launch in `state_of` (`a_launch...`
      test ok); the reference's *Failure handling* records that a real deleted database
      answering 404 was not run, since that would delete one.*
- [x] `command.rs` and `lib.rs`: `organization_delete(password)`, owner only; `host.ts`,
      `tauri.ts`, `router.ts` (`organization.delete` under the owner's procedures) and `query.ts`
      follow; `router.test.ts` pins it. The sync section's authority block draws an outline
      destructive control for the owner alone, opening a `FormSurface` of `heavy` weight whose
      body names what goes (every workspace's records and every member's way in, on every
      machine) and takes the password; `area.svelte.test.ts` finds the control for the owner and
      not for an administrator, and the confirmation with its sentence and its password field.
      *Verified: `organization_delete` in `command.rs` and `lib.rs`; `organization.delete` in
      `router.ts`, `useDeleteOrganization`, `delete-organization.svelte` beside
      `forget-account.svelte`; `router.test.ts`: `pass 14`; `area.svelte.test.ts`: 17 passed,
      the owner finds the control and, on press, the form surface with one password field and
      the sentence naming what goes; an administrator finds neither the control nor the
      authority legend.*
- [x] Every new or changed string is written in both locales; `pnpm check`, `pnpm lint`,
      `pnpm test` and `cargo test` pass; the changeset of ticket 03 is extended with one line.
      *Verified in the run's worktree: five keys in both locales, no types drift;
      `validate.mjs`: `266 artifacts checked, no failures`; `pnpm check` exit 0 (desktop `9304
      FILES 0 ERRORS 0 WARNINGS`), `pnpm lint` exit 0, `pnpm test` exit 0 (desktop `187
      passed`); `cargo test`: `383 passed`; the changeset carries the delete's line.*

## Relevant areas

`apps/desktop/tauri/src/organization/{removal,forget,command,setup}.rs`,
`apps/desktop/tauri/src/sync/turso/platform.rs`, `apps/desktop/tauri/src/lib.rs`,
`apps/desktop/src/lib/platform/{host,tauri}.ts`, `apps/desktop/src/lib/organization/{router,query}.ts`,
`apps/desktop/src/lib/organization/component/` (a new delete component beside
`forget-account.svelte`), `apps/desktop/src/lib/settings/component/area.svelte`,
`apps/desktop/src/routes/settings/+page.svelte`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`,
`.aep/references/turso.md`, and the tests beside each.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *The owner
  deletes the organization*.**
- **[[references/turso]], *Never run***: a delete is one of the fixed reasons, as a variant of
  the type, and nothing else in this ticket deletes.
- **[[rules/interface]], *Form surface***: the confirmation is the shared surface at declared
  weight; the password field is marked on a refusal.
- **No live test deletes anything the human did not provision for it.**

## Notes

- *2026-09-16, at integration.* `delete_organization(app_state, platform, password)`: the act
  both deletes and forgets, and the forget needs write access to the locks a `store` and a
  `session` would be borrowed from, so it takes the app state and reads them under short
  guards; `now` had nothing to stamp. `abandon_the_consent` is not called because `forget`
  already clears the token and the slug. The delete refuses any workspace name that is not a
  `ws-` database.
- **Raised, carried to the close:** a machine sitting at the wall at launch reaches no
  organization database, so it learns the organization is gone one launch after the sign-in
  whose pull fails, not at the launch itself. Reading the sign on the sign-in's pull would
  close it; the criterion does not ask for it.
- What a real deleted Turso database answers was not run, since running it deletes one; the
  sign fires on 404 alone and never on 401 or 403, which is the safe direction.
