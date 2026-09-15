---
status: open
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

- [ ] `store.rs`: `machine_link (id TEXT PRIMARY KEY NOT NULL, member_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL, consumed_at INTEGER, created_at INTEGER NOT NULL)` is the
      eighth entry of `TABLES` and `SCHEMA`, with a docstring saying it is unsigned and why;
      `write_machine_link`, `machine_link(id)`, `consume_machine_link(id, now)` and
      `delete_open_machine_links_of(member_id)` are unsigned reads and writes; the
      seven-tables test becomes eight.
- [ ] `tauri/src/organization/machine.rs`: `make(store, session, kdf, now) -> MachineLink {
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
- [ ] `command.rs` and `lib.rs`: `machine_link_make() -> MachineLink` for any member and
      `machine_connect(link, code) -> OrganizationState` public; `organization_link_read`
      answers `kind: machine` for one. `host.ts`, `tauri.ts`, `router.ts` (`machine.link`
      under `procedure.member`, `machine.connect` under `procedure.public`) and `query.ts`
      (`useMakeMachineLink`) follow; `router.test.ts` pins them.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass; the changeset of ticket
      03 is extended with one line.

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
