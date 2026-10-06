---
status: resolved
blocked-by: [03, 06]
---

# feat(organization): a machine holds several organizations, one open at a time

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]], and [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/plan]] (*One organization open; select, remove, resume*).

## Outcome

Setting up, connecting an existing organization, accepting an invitation and connecting by a machine link each add an organization and select it. `session_select` and `session_remove` exist; removing forgets exactly one organization's files, key, entry and consent. A link or connect-existing for a held organization selects it before anything is opened. Resume opens the selected organization only, and only the open one replicates.

## Acceptance Criteria

Traces requirements 1, 5, 8, 9, 12 and 13, and criteria 1 (the Rust half), 5 (the Rust half), 8, 9, 12 and 13.

- [x] The five `AnotherOrganizationHeld` refusals become adds that select the new entry; the reason, its strings and the frontend's mapping are removed; a first run into a group that already holds an organization is still refused. Rust tests for each path over a machine already holding one.
- [x] `forget_one(id)` replaces the prefix-wide sweep, as the plan describes; `session_disconnect`, delete-organization, `forget_deleted_organization` and the old-shape check call it. Criterion 5's Rust test: two organizations, each with a workspace replica and a remembered key, one with a consent; removing one leaves the other's files, key, entry and consent byte-for-byte; removing the last leaves no entry and no selection.
- [x] `session_select(id)` persists the selection and is refused while a session is open; `session_remove(id)` forgets that organization; both are commands with router procedures and host methods.
- [x] Sign-out forgets only the open organization's key (criterion 8); resume tries the selected entry only; the heartbeat replicates the open organization only, and one signed out elsewhere while not open shows as signed out at its next sign-in (criterion 9). Rust tests.
- [x] A link, machine link or connect-existing for a held organization selects it, signing any open session out, before any store is opened over a live replica; a connect-existing then admits nothing, and a link is judged on the held replica: a reset link for a member of it admits them to set a new password, anything else (an invitation, a machine link, a spent or lapsed link) is refused as already used with the record unchanged. For one not held it adds it (criterion 13, as settled by the human 2026-10-05). A removed organization's old link is refused as used, and a new link for the same account admits it (criterion 12).
- [x] `signed_out_elsewhere`, `last_reached_at` and the refusals are cleared on select, sign-out and remove.

## Relevant areas

- `apps/desktop/tauri/src/organization/session/{forget.rs,command.rs,replica.rs,heartbeat.rs}`, `organization/invitation/{connect.rs,join.rs,machine.rs}`, `organization/setup/{command.rs,connect.rs,mod.rs}`, `tauri/src/error.rs`
- `apps/desktop/src/lib/organization/{host.ts,tauri.ts,router.ts}`, `src/lib/error/tauri.ts`

## Constraints

- The held short-circuit runs before `reached` opens a store, so no second store opens over a live replica.
- This ticket changes the commands; the frontend state shape moves in ticket 08, so `OrganizationState` here may carry both the list and today's `organization` until 08 removes the latter.
