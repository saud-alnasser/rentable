---
status: resolved
blocked-by: ['04', '08', '09']
---

# feat(organization): the workspaces and sync sections

## Outcome

The workspaces section is one list of rows with the name, the member count and the open mark,
rename, members and delete behind their gates, new workspace for the owner holding authority,
and export and import beneath acting on the open workspace; the sync section carries the sync
status and sync now, the account refusal, the Turso account with reconnect and forget, the
organization link and disconnect this machine, each shown to whom the spec says. The
workspace page's identity and members components are gone.

## Acceptance Criteria

Traces requirement 16, requirement 14 (the sync section) and requirement 5 (what the
interface offers) of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]], and
its criterion 16, criterion 14 (the sync section) and criterion 5 (the interface half).

- [x] `organization/component/workspaces.svelte` renders one row per workspace the session
      holds: name, member count, the open mark; rename opens `workspace/component/rename-form.svelte`
      behind `renameWorkspace`; members opens `access-dialog.svelte` for that workspace behind
      `grantWorkspace`; delete opens a `DeleteDialog` naming what is lost, for the owner; new
      workspace is the owner's button opening the workspace dialog, drawn with the reconnect
      sentence for an owner without authority and absent for everybody else.
- [x] `workspace/component/transfer.svelte` renders beneath the list under a legend naming the
      open workspace; `workspace/component/{identity,members}.svelte` and their strings do not
      exist.
- [x] The sync section composes `workspace/component/sync.svelte`,
      `organization/component/reconnect-authority.svelte` (owner without authority), a
      forget-Turso-account control over `consent.disconnect` (owner with authority, asking
      once), `organization-link.svelte` (owner) and `disconnect.svelte`; a plain member sees
      the sync status and disconnect only.
- [x] `workspaces.svelte.test.ts` (new) renders the rows, finds rename, members and delete
      each behind its gate, new workspace only for an owner with authority, and export and
      import present; a sync section test finds the owner's items present and a member's
      absent.
- [x] Every string is written in both locales; `workspace.membersDescription`,
      `workspace.roleOwner`, `workspace.groupIdentity` and `workspace.groupMembers` are gone.
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass; a changeset rides with the change.

## Relevant areas

`apps/desktop/src/lib/organization/component/{workspaces,access-dialog,organization-link,reconnect-authority,disconnect}.svelte`,
`workspace/component/{identity,members,sync,transfer,rename-form}.svelte`,
`settings/component/area.svelte`, `organization/query.ts`, `i18n/{en,ar}/index.ts`, and the
tests beside them.

## Constraints

- **Read [[efforts/826-the-organization-and-the-way-in-are-rethought/plan]], *Components* (the
  workspaces and sync rows) and *Integration*.**
- **[[rules/interface]]**, *Form surface*; the delete dialog is the packaged `DeleteDialog`.
- **`workspace_delete` is the owner's in Rust**; the section gates on the session's role and
  authority, never on a permission bit.
- **`permitted.svelte` is not used here**; the section gates on the props the area hands it.

## Notes

Built by an implementer and landed on 2026-09-14. Departures: rename is drawn on the open
workspace's row alone, since `remoteSync.rename` renames this machine's open workspace and
takes no id, and a rename per row would have changed the port; delete is gated on `isOwner`
alone, as the criterion says, and an owner without the authority meets Rust's refusal through
the shared handler; `workspace.identityDescription` was removed with `identity.svelte`, its
only reader; `layout.workspaceMenu.workspaceRefusedAuthority` now points at the sync section
rather than the retired organization page; the two workspaces tests that lived in
`invite-form.svelte.test.ts` moved to the new `workspaces.svelte.test.ts`; the transfer block
is drawn only where a workspace is open, since the legend names it. The forget control is its
own `forget-account.svelte` over `consent.disconnect`; `useDeleteWorkspace` was added to
`query.ts`; the members action is `access-dialog.svelte` read the other way round, rows being
members with their access on that one workspace.

Raised, not taken: a rename from any row is a port change and needs its own ticket; deleting
the open workspace is permitted by Rust and here, and nothing says what the shell should do
with a replica whose database is gone; `workspace.{groupSync,groupTransfer,title}` are dead
keys left for ticket 12's sweep; `sectionsFor` still takes a flag it does not read;
`rename-form.svelte`'s input carries no `name` attribute.
