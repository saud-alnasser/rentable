---
status: resolved
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

- [x] `setup.rs`: `group_inspect(store, platform) -> GroupState { Empty | Held { organization_id
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
      *Verified 2026-09-16 on the effort branch: `setup::group_inspect`, `GroupState`,
      `connect_existing`, `store::members_unverified` with `setup.rs` as its one caller
      outside tests; `cargo test -- --test-threads=1`: `379 passed; 0 failed; 10 ignored`,
      with `the_owners_password_connects_this_machine_to_the_organization_the_group_holds`,
      `an_administrators_password_is_refused_and_the_machine_holds_nothing`,
      `a_machine_seen_six_days_ago_shuts_the_way_in_and_the_consent_is_let_go_of`,
      `a_wrong_username_or_password_meets_the_walls_one_sentence`,
      `the_inspect_says_whether_the_group_already_holds_an_organization`,
      `the_unverified_member_read_has_one_caller` and the create path's
      `a_group_already_holding_an_organization_refuses_the_run_and_gives_the_consent_back` all
      ok. `connect_existing` takes no `kdf`, since the vault row carries its cost; see Notes.*
- [x] `command.rs` and `lib.rs`: `organization_group_inspect() -> GroupState` and
      `organization_connect_existing(username, password) -> OrganizationState`, both public;
      `host.ts`, `tauri.ts`, `router.ts` (`organization.groupInspect` and
      `organization.connectExisting` under `procedure.public`) and `query.ts` follow;
      `router.test.ts` pins them.
      *Verified: both commands registered in `lib.rs` (lines 240 and 241); `router.ts` carries
      `organization.groupInspect` and `organization.connectExisting` under `procedure.public`;
      `query.ts` has `useInspectGroup` and `useConnectExisting`; `router.test.ts` lists both
      and pins the hand-off and the refused input; `pnpm test` exit 0.*
- [x] `organization/setup.ts`: `SetupStep` gains `existing`; after the consent the walk calls the
      inspect and goes to `name` on `empty` and to `existing` on `held`; `setup-walk.svelte`
      draws `existing` as one sentence saying the group already holds an organization and that
      its owner signs in to connect this machine, the username and password fields and a connect;
      a refusal keeps the step and marks the password field, or, for the connected-machine
      refusal, returns to the connect step carrying the sentence as requirement 21's refusal does;
      the `oneOrganization` statement on the connect step says a held group is connected to
      rather than refused; `setup.test.ts` and the walk's component test drive both outcomes.
      *Verified: `SetupStep = 'connect' | 'existing' | 'name' | 'workspace'` with
      `CONNECT_EXISTING_STEPS`, `stepAfterConsent` and `refusalAfterFailedConnect` in
      `setup.ts`; the walk draws the `existing` step (title `sign in to your organization`,
      one sentence, the two fields, `connect this machine`); `oneOrganization` reads that a
      held group is connected to, not refused; `setup.test.ts` and `setup-walk.svelte.test.ts`
      drive both outcomes and both refusals in the `pnpm test` run.*
- [x] Every new or changed string is written in both locales; `pnpm check`, `pnpm lint`,
      `pnpm test` and `cargo test` pass; the changeset of ticket 03 is extended with one
      paragraph on the owner connecting to their organization with the account.
      *Verified in the run's worktree: `existingTitle`, `existingDescription`,
      `existingConnect`, `existingConnecting` in `en` and `ar`, Arabic written, types
      regenerated with no drift; `pnpm check` exit 0 (desktop `9305 FILES 0 ERRORS 0
      WARNINGS`), `pnpm lint` exit 0, `pnpm test` exit 0 (desktop `189 passed`); the changeset
      carries the paragraph on the owner getting back in.*

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

- *2026-09-16, at integration.* Seven departures from the ticket's letter, all reported by the
  child and accepted as factoring: `group_inspect(platform_token, mcp)` reads a fresh listing
  rather than the recorded account, because the recorded route skips the one-organization check
  on a later create; `connect_existing` takes no `kdf`, the vault row carrying its cost; the
  registry gate is read with the organization row's own key, since it runs before any password
  work, and the row's key is proved the derived one a moment later or the run is refused;
  the wall's one sentence names "the organization this turso account holds", since the name
  opens only after a vault does; the connect step still counts itself as step 1 of 3 and the
  existing step as 2 of 2; the organization context's one-organization bullet was corrected in
  the same commit; `cargo fmt --check` fails on this tree with the same 35 hunks it failed with
  before, none this ticket's, and it is not in the lint gate.
- `connect::record` is now the one writer of `HeldOrganization` outside the first run; nothing
  from the unverified read reaches the session, since past the key comparison the sign-in is the
  wall's own over verified rows.
