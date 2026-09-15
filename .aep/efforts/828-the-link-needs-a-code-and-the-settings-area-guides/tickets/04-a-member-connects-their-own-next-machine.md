---
status: resolved
blocked-by: ['03']
---

# feat(organization): a member connects their own next machine

## Outcome

A signed-in member makes a link and a code for another machine; opening the link on a machine
holding no organization, with the code, connects it and lands at the wall, where the same
username and password sign them in. The link admits one machine once and lapses after seven
days or when the credential it carries does, whichever is sooner. The row that spends it is
unsigned, like the session epoch, and says why.

## Acceptance Criteria

Traces requirements 2 and 3 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 2,
3 and 12.

- [x] `store.rs`: `machine_link (id TEXT PRIMARY KEY NOT NULL, member_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL, consumed_at INTEGER, created_at INTEGER NOT NULL)` is the
      eighth entry of `TABLES` and `SCHEMA`, with a docstring saying it is unsigned and why;
      `write_machine_link`, `machine_link(id)`, `consume_machine_link(id, now)` and
      `delete_open_machine_links_of(member_id)` are unsigned reads and writes; the
      seven-tables test becomes eight. *Verified 2026-09-15 on the effort branch: `store.rs` has
      `TABLES: [&str; 8]` and `SCHEMA: [&str; 8]` with `machine_link` as the plan spells it;
      `MachineLinkRecord` and `write_machine_link` are documented `Unsigned on purpose`; the
      renamed test `the_eight_tables_exist_and_an_organization_holds_two_workspaces_at_once` is `ok`
      in `cargo test -- --test-threads=1`.*
- [x] `tauri/src/organization/machine.rs`: `make(store, session, kdf, now) -> MachineLink {
      link, code, expires_at }` draws a secret and a code, deletes the member's open rows,
      writes one for the earlier of seven days and `credential_expiry` of the session's
      organization credential, and builds the link with that credential sealed as ticket 03
      seals it, a `Machine` half and no vault password; `connect(store_for, machine, link,
      code, now) -> HeldOrganization` refuses while held, unseals, reaches, refuses a missing,
      lapsed or consumed row by name, records the organization through `connect::connect`
      with no member, marks the row consumed and pushes. Tests: make then connect on a second
      store lands connected with no member; `sign_in_by_username` admits with the unchanged
      password; a second connect is refused as consumed; a connect after seven days as lapsed;
      a wrong code with `CODE_REFUSED`; a rewritten row reopens the link and still lands at the
      wall; the payload's credential is the session's with an expiry within four weeks.
      *Verified: `machine::tests::a_member_makes_a_link_for_their_next_machine_and_the_same_password_admits_them_there`,
      `one_machine_once_and_a_lapsed_link_or_a_wrong_code_reaches_nothing`,
      `a_rewritten_row_reopens_a_spent_link_and_the_machine_still_lands_at_the_wall` and
      `a_machine_link_seals_the_members_own_grant_and_lapses_no_later_than_it_does` are `ok`; the
      fixture signs in a plain member. `connect` takes `kdf_params` besides what is written here,
      as `join::accept` does, because the parameters are not in the sealed blob; see Notes.*
- [x] `command.rs` and `lib.rs`: `machine_link_make() -> MachineLink` for any member and
      `machine_connect(link, code) -> OrganizationState` public; `organization_link_read`
      answers `kind: machine` for one. `host.ts`, `tauri.ts`, `router.ts` (`machine.link`
      under `procedure.member`, `machine.connect` under `procedure.public`) and `query.ts`
      (`useMakeMachineLink`) follow; `router.test.ts` pins them. *Verified: both commands in
      `command.rs` and registered in `lib.rs`; `host.ts` carries `MachineLink`, `machineLinkMake`,
      `machineConnect`; `router.test.ts` lists `machine.connect` and `machine.link` and pins the
      gating in `making a machine link needs a session, and connecting with one reaches the host
      signed out`; `link::read` answers `LinkKind::Machine` in the first machine test.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; the changeset of ticket
      03 is extended with one line. *Verified in the run's worktree: `pnpm check` exit 0 (desktop
      `9302 FILES 0 ERRORS 0 WARNINGS`), `pnpm lint` exit 0, `pnpm test` exit 0 (`Tasks: 4
      successful`, desktop `175 passed`), `cargo test -- --test-threads=1`: `369 passed; 0
      failed; 10 ignored`; `.changeset/a-link-needs-its-code.md` carries the second paragraph.*

## Relevant areas

`apps/desktop/tauri/src/organization/{machine,store,link,connect,command}.rs`, `apps/desktop/tauri/src/lib.rs`,
`apps/desktop/src/lib/platform/{host,tauri}.ts`, `apps/desktop/src/lib/organization/{router,query}.ts`,
and the tests beside each.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *A second
  machine is a link with an unsigned row behind it*.**
- **The row is unsigned on purpose** (spec, *Risks*): no certificate is read or written, and
  the test that rewrites the row is what records the limit.
- **The link's credential is used for the one pull and held nowhere**; the wall's sign-in
  fills the slot from the vault as it does today.
- **[[rules/module-layout]]**: `machine.rs` is a module beside `join.rs`, registered in
  `organization/mod.rs`.

## Notes

- *2026-09-15, at integration.* `machine::connect` takes the Argon2id parameters from its caller,
  as `join::accept` and `machine::make` do, because the seal does not carry them and the tests
  cannot derive at shipping cost; the command passes `setup::SHIPPING_KDF`. The signature above
  omitted the parameter and is read with it.
- Four private helpers of `invite.rs` (`generate_link_secret`, `held_credential`, `link_expiry`,
  `random_id`) widened to `pub(super)` so the machine link is minted through the same
  seven-days-or-the-grant decision rather than a copy.
- The organization context's *Organization* entry said seven tables; corrected to eight, naming
  the machine link, in this commit.
