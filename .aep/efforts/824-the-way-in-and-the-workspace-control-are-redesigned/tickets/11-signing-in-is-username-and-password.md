---
status: open
blocked-by: [09, 10]
---

# feat(organization): signing in is username and password

## Outcome

`organization_sign_in(username, password)` finds the account by the password and checks the
username, consumes a pending invitation on the first sign-in, and fills the record's member; the
invitation has no sealed half, the link has no invitation half, and `join` and `restore` are gone.

## Acceptance Criteria

Traces requirement 19, requirement 18 and requirement 22 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 19 and criterion 18 (the Rust half).

- [ ] `organization_sign_in(username, password)` opens a session when the pair matches a member
      of the held organization; the wrong password, an unknown username, and a known username with
      another member's password are each refused with the same one sentence. Asserted over a store
      with two members.
- [ ] A first sign-in by a member with an open invitation marks it consumed and pushes, and the
      session carries `must_change_password`; a lapsed invitation refuses by name; sign-out leaves
      the record naming the organization with its member. Asserted.
- [ ] `invitation` carries `id`, `member_id`, `expires_at`, `consumed_at`, `certificate_id`,
      `signature`, `created_at` and no `sealed_payload`, `kdf_salt` or `kdf_params`; `JoinLink`
      has no `invitation`; `open_invitation`, `InvitationPayload`, `join::join`, `join::restore`,
      `organization_join` and `organization_restore` do not exist (`grep`). `LinkStanding` keeps
      what the connect screen reads. Reissue and revoke still work over the columns that stay.
- [ ] `host.ts`, `platform/tauri.ts`, `organization/router.ts` and `organization/join.ts` lose
      the join and restore calls and gain `signIn(username, password)`.
- [ ] `cargo test` and `pnpm check` pass.

## Relevant areas

`apps/desktop/tauri/src/organization/{join,session,invite,link,store,command}.rs`;
`apps/desktop/src/lib/platform/{host,tauri}.ts`, `organization/{router,join}.ts`.

## Constraints

- **Read [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/plan]], *Signing in is username and password*.**
- **[[rules/credentials]]**: one sentence for every refusal that could tell a username from a
  password; the cost of trying every vault is the spec's constraint, not something to index
  around.
- **A changeset rides with the change.**
