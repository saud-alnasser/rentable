---
status: open
blocked-by: []
---

# chore(desktop): the seed fills the organization with roles, members and workspaces

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-03, verbatim: "also seed roles; and make roles  and members seedning part of the seed script". `pnpm db:seed` (`apps/desktop/scripts/seed.ts`) seeds the organization as well as the workspace records. Member and role rows are signed and carry sealed keys, so no script can write them: only a signed-in owner's running app holds the keys. The seed therefore reaches the running development app and calls its own commands, the way the orchestrator seeded by hand on 2026-10-03: over the webview's remote debugging port (Chrome DevTools Protocol, `Runtime.evaluate` of `window.__TAURI_INTERNALS__.invoke('plugin:organization|...')`), using `role_create` (`name`, `mask`, `afterRoleId`; a custom role goes below the manager and above the member, so chain each new role after the previous one starting from `manager`), `invitation_member_create` (`username`, `roleId`, `overrideMask`, `workspaces: [{id, access}]`, access `full-access` or `read-only`), `role_assign`, `role_list`, `member_list`, and the workspace list for the grants. It seeds a dozen custom roles with masks between the member and manager presets, and around thirty members across the presets and custom roles, some granted the current workspace full or read only and some not. It is safe to run twice: a username or role name already there is skipped, not an error. The development launch opens the debug port (on Windows the `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>` environment, set by `scripts/tauri-with-env.mjs` for `dev` only, never for `build`); where no app answers on the port, or nobody is signed in, or the platform's webview has no such port (macOS, Linux), the organization step says so plainly and the records seed still runs. A flag (`--records-only` / `--organization-only`, or the repo's existing argument manner) picks one half. Nothing ships: the code lives in `scripts/` and the launch change is dev-only.

**Revised 2026-10-03** by the human: "same thing also for thew orkapces seed workspaces and make the seeding part of the seed script". The seed also creates about a dozen workspaces through `workspace_create` (each a hosted Turso database on the owner's account, said so in its output; names already present skipped; refused plainly on a machine that is not the owner's) and grants a few members into each through `workspace_grant`, some read only, one left with nobody; held grants skipped. Order: roles, members, workspaces, grants.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03.

- [ ] A node test of the organization seed's plan (with the invoke stubbed): it chains role creation from the manager, creates the members with their roles and grants, creates the workspaces and grants members into them, skips names already present, and reports an unreachable app or a signed-out one without failing the records seed.
- [ ] `scripts/tauri-with-env.mjs` sets the debug port for `dev` on Windows and never for `build`; a test or the commit body shows it.
- [ ] Run against the running app (the orchestrator does this), a second run creates nothing new and says so.
- [ ] Desktop check and node tests; eslint and prettier on changed files; the remote-sync or organization context names the seed's organization step and why it goes through the app; `validate.mjs` passes.

## Relevant areas

- `apps/desktop/scripts/seed.ts`, `apps/desktop/scripts/database.ts`, `apps/desktop/scripts/tauri-with-env.mjs`, `apps/desktop/tauri/src/organization/{role,invitation}/command.rs` (the commands, read only)

## Constraints

- Development only: nothing under `src/` or `tauri/src/` changes; no changeset (it is not user-visible).
- No credentials in the script; it never reads the vault or the keyring.
