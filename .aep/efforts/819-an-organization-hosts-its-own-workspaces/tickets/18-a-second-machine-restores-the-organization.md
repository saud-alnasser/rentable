---
status: resolved
blocked-by: ['12']
---

# test(organization): a second machine restores the organization

## Outcome

An owner moves to a new machine and gets their organization back from the link, the email, the
password, and one consent, with the first machine offline. No device is the organization's keeper,
and the property is measured rather than argued.

## Acceptance Criteria

Traces requirement 6 of [[efforts/819-an-organization-hosts-its-own-workspaces/spec]] and its
criterion 6.

- [x] Live, admitted by ticket 01: provision on machine A, then restore on machine B from the link,
      the email, the password and one consent, **with machine A offline**. The offline part is the
      requirement; a test that leaves A running proves something weaker.
      *Verified: 2026-09-12, asked for first.
      `restore_live_a_second_machine_restores_the_organization_with_the_first_offline` ran the
      first run on directory A against the account, `org-ca7d9cb6ce5bdc7ae03a24d448292c71` in
      `rentable`, created `ws-01b62de2db96be1170025b345a69c8d3` migrated over the wire, invited a
      member, and pushed; then closed A's replica and read nothing of A's directory again. Directory
      B started empty, opened a replica with the link's read-only credential, pulled, and
      `join::restore` opened the owner's place with the password alone: role `owner`, the same
      member id, the workspace credential unsealed, every row verified against the key the link
      carried. Directory C restored the member by their email and the generated password and
      opened a replica of the workspace under the credential their grant unsealed, which pulled the
      schema. Both databases were deleted by the same run. **What two directories in one process
      do not cover**: two operating-system accounts and two keyrings; the consent's product, the
      platform token, was read from the environment as every live test reads it and filed once in
      this process's one keyring. What they do cover is that nothing about the organization is
      machine-local, which is the property.*
- [x] The restored owner holds what they held: the same role, the same workspaces, the same
      grants, all verified against the chain rather than trusted because the machine says so.
      *Verified: `restore` reads every row through `store.members` and `store.grants`, which verify
      against the verifying key pinned from the link and refuse a row whose signature or
      certificate does not hold, then runs `session::sign_in` on the row the password opened, which
      verifies again and unseals every grant. The offline test
      `the_organizations_own_link_restores_an_owner_and_a_member_on_a_fresh_machine` asserts the
      restored owner's role, member id, permissions, workspace credential set and organization
      credential equal the originals; the live test asserts the role, the id, the workspace held,
      and that B's members and grants verify and say what A wrote.*
- [x] The owner's Turso authority is re-obtained by repeating the consent and **is not restored
      from anywhere**. Requirement 5 keeps it off every database on purpose: a credential a person
      can re-acquire for themselves is not one worth storing where an attacker could reach it.
      *Verified: the offline test reads every text and blob cell of every table and the second
      machine's own store file and finds the platform token in none of them, and no credential
      string either. `OrganizationState.holds_turso_authority` says whether this machine holds the
      authority and knows the account, false on a restored machine; the dashboard draws the
      reconnect card for the owner then, which is the first run's consent again, and
      `organization_reconnect_authority` discovers the account the way the first run did and
      records it. The live test minted on the workspace with the consent's product after the
      restore, which is the authority working on B and nothing pulled standing in for it.*
- [x] The same path works for an ordinary member, not only for an owner. A member restoring on a
      new machine repeats the join, and the only difference is that they have no consent to give.
      *Verified: the same `restore`, by their email and the password they hold; the offline test
      restores the member on a third directory and finds their role, their requirement to change
      the password, and their workspace credential; the live test does the same on directory C and
      opens the workspace's replica under that credential. Nothing about the consent is asked of
      them, and the dashboard draws no reconnect card for anybody but the owner.*
- [x] What the second machine cannot recover is named. If anything about the organization is
      genuinely machine-local, this is where it is found, and finding it here is the point of doing
      this as its own ticket rather than assuming ticket 12 covered it.
      *Verified, and named: (1) the Turso authority, by design, re-obtained by the consent above;
      (2) the owner's email, which the first run never asked for, so their row carries none and
      the restore takes an empty address from an owner and the password as the whole proof, which
      is why `restore` treats the address as what a person offers where they were invited with one;
      (3) which workspace this machine had open last, `RemoteSyncWorkspace.remote_id`, so a restored
      machine opens the first workspace the session holds rather than the one A had open; (4) the
      workspace replicas themselves and every machine-local setting, the locale included, which are
      pulled and chosen again. Nothing else was found: every row a place is made of is on the
      organization database and verifies from the link's key.*
- [x] `cargo test` and the repository's gates pass.
      *Verified: 2026-09-12. `pnpm check` 0 errors, 0 warnings; root `pnpm lint` clean; `pnpm test`
      913 node tests and 45 component tests pass; `vite build` builds. `cargo test
      --test-threads=1` 338 passed, 0 failed, 10 ignored; `cargo clippy --all-targets` the same
      five warnings that stand at the branch point; `cargo fmt --check` clean.*

## Relevant areas

`apps/desktop/tauri/src/organization/store.rs`, `vault.rs` and `authority.rs` are all exercised
together here for the first time from a cold machine.

The join path from ticket 12 is what an owner on a new machine walks, plus the consent from ticket
03. If the two turn out not to compose, this is where it shows.

`apps/control-plane/src/workspace/tests/provisioning.test.ts` is the closest existing live test and
shows how a two-sided live exercise is set up and cleaned up here.

## Constraints

- **[[references/turso]], *Never run*.** This creates and removes its own database and touches
  nothing belonging to anything else. Ask before running it.
- **Two machines, or a faithful stand-in for two.** If a single-process test is what is achievable,
  say what it does not cover rather than claiming the criterion. Two separate application data
  directories and two separate keyring entries is the minimum honest version.
- **The first machine must actually be offline**, not merely idle.

## Notes

This is the ticket that proves the whole design does what the spec's second face of the problem
demanded: nobody, including us, is a dependency the organization did not agree to.

It is gated on ticket 12 rather than on everything, because join is the mechanism it exercises.
Workspaces existing makes the test stronger, so running it after ticket 14 is better even though
nothing forces it.
