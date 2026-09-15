---
status: open
blocked-by: ['09']
---

# feat(organization): the account connects to the organization the group holds

## Outcome

After the consent, a group holding nothing runs the walk as today; a group already holding an
organization is said to hold one, and the walk asks for the owner's username and password and
connects this machine to it, signed in, with every grant renewed. Only the owner's password
does it, because only the owner's password re-derives the organization's key, and that key is
what the machine verifies against. While an owner's or an administrator's machine is connected,
the walk refuses and says that machine can hand out a link.

## Acceptance Criteria

Traces requirement 14 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 14
and 12.

- [ ] `setup.rs`: `group_inspect(store, platform) -> GroupState { Empty | Held { organization_id
      } }` reads the listing through `discovery::organization` and recognises `org-<id>` as
      `one_organization_to_a_group` does; `connect_existing(store, machine, platform, username,
      password, kdf, now) -> HeldOrganization` mints a full-access four-week credential for the
      held database on the consent, opens a replica at the listing's hostname and pulls; reads
      `store::connected_machines(now)` and, where any row's member carries the owner's or an
      administrator's role, refuses with `PreconditionFailed` naming that a connected machine can
      hand out a link, calls `abandon_the_consent` and drops the replica; otherwise reads the
      member rows through an unverified read that exists for this caller alone and says so,
      finds the row whose sealed username matches and whose vault the password opens, derives the
      organization key from the vault's secret, refuses with `Forbidden` naming that only the
      owner connects this way where the derived key's public half is not the organization row's
      `verifying_key` or any member row fails to verify against it, and otherwise opens the name
      from `name_sealed`, writes `HeldOrganization` with a fresh `machine_id`, registers the
      machine, opens the session, runs `workspace::renew_credentials`, and pushes. Tests: over
      the in-memory platform holding a listing with `org-<id>`, the owner's password lands the
      machine holding the organization, signed in, with every grant's expiry within four weeks of
      `now`; an administrator's password is refused as `Forbidden` and the machine holds nothing;
      a registry row of an owner's machine six days old refuses as `PreconditionFailed` and the
      authority is gone; a wrong username or password is refused with the wall's one sentence;
      an empty listing still creates; the unverified read has one caller.
- [ ] `command.rs` and `lib.rs`: `organization_group_inspect() -> GroupState` and
      `organization_connect_existing(username, password) -> OrganizationState`, both public;
      `host.ts`, `tauri.ts`, `router.ts` (`organization.groupInspect` and
      `organization.connectExisting` under `procedure.public`) and `query.ts` follow;
      `router.test.ts` pins them.
- [ ] `organization/setup.ts`: `SetupStep` gains `existing`; after the consent the walk calls the
      inspect and goes to `name` on `empty` and to `existing` on `held`; `setup-walk.svelte`
      draws `existing` as one sentence saying the group already holds an organization and that
      its owner signs in to connect this machine, the username and password fields and a connect;
      a refusal keeps the step and marks the password field, or, for the connected-machine
      refusal, returns to the connect step carrying the sentence as requirement 21's refusal does;
      the `oneOrganization` statement on the connect step says a held group is connected to
      rather than refused; `setup.test.ts` and the walk's component test drive both outcomes.
- [ ] Every new or changed string is written in both locales; `pnpm check`, `pnpm lint`,
      `pnpm test` and `cargo test` pass; the changeset of ticket 03 is extended with one
      paragraph on the owner connecting to their organization with the account.

## Relevant areas

`apps/desktop/tauri/src/organization/{setup,store,session,vault,connect,command}.rs`,
`apps/desktop/tauri/src/sync/turso/{discovery,platform}.rs`, `apps/desktop/tauri/src/lib.rs`,
`apps/desktop/src/lib/platform/{host,tauri}.ts`, `apps/desktop/src/lib/organization/{setup,router,query}.ts`,
`apps/desktop/src/lib/organization/component/setup-walk.svelte`,
`apps/desktop/src/routes/organization/new/+page.svelte`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`,
and the tests beside each.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *The account
  connects to the organization the group holds*, and the research file it cites.**
- **The derived key is the anchor** (spec, *Constraints*): the row's key is compared and never
  trusted; the unverified read leaks into no other caller.
- **Only the owner's machine mints**, and this mints on the owner's own consent.
- **The password never crosses back** ([[rules/credentials]], *Client boundary*): it goes in,
  facts come out.
- **826's requirement 21 still holds**: nothing here creates in a held group.

## Notes
