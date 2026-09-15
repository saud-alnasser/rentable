---
status: open
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

- [ ] `sync/turso/platform.rs`: `DeletionIntent` gains `OrganizationDeletedByHuman`, and
      [[references/turso]]'s *Never run* names it as the third reason. `removal::delete_organization(store,
      session, platform, password, now)` is refused for anybody but the owner, re-opens the
      owner's vault with the password and refuses a wrong one before anything is touched, lists
      the workspaces from the replica, deletes each workspace database and then the organization
      database through `delete_database` with the new intent, forgets the organization on this
      machine as `disconnect` does and lets the consent go. Tests: as the owner, every workspace
      database and the organization database are deleted in that order with that intent and the
      machine holds nothing after; an administrator is refused with nothing deleted; a wrong
      password is refused with nothing deleted.
- [ ] `forget.rs`: a machine whose launch pull is refused because the organization database no
      longer exists on the platform forgets the organization and lands on the first screen; the
      ticket establishes what libsql answers for a deleted database and keys the sign on it, or
      records in Notes that it cannot be told from a network fault and what a machine meets
      instead. A test pins whichever it is.
- [ ] `command.rs` and `lib.rs`: `organization_delete(password)`, owner only; `host.ts`,
      `tauri.ts`, `router.ts` (`organization.delete` under the owner's procedures) and `query.ts`
      follow; `router.test.ts` pins it. The sync section's authority block draws an outline
      destructive control for the owner alone, opening a `FormSurface` of `heavy` weight whose
      body names what goes (every workspace's records and every member's way in, on every
      machine) and takes the password; `area.svelte.test.ts` finds the control for the owner and
      not for an administrator, and the confirmation with its sentence and its password field.
- [ ] Every new or changed string is written in both locales; `pnpm check`, `pnpm lint`,
      `pnpm test` and `cargo test` pass; the changeset of ticket 03 is extended with one line.

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
