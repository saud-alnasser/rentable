---
status: open
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

- [ ] Live, admitted by ticket 01: provision on machine A, then restore on machine B from the link,
      the email, the password and one consent, **with machine A offline**. The offline part is the
      requirement; a test that leaves A running proves something weaker.
- [ ] The restored owner holds what they held: the same role, the same workspaces, the same
      grants, all verified against the chain rather than trusted because the machine says so.
- [ ] The owner's Turso authority is re-obtained by repeating the consent and **is not restored
      from anywhere**. Requirement 5 keeps it off every database on purpose: a credential a person
      can re-acquire for themselves is not one worth storing where an attacker could reach it.
- [ ] The same path works for an ordinary member, not only for an owner. A member restoring on a
      new machine repeats the join, and the only difference is that they have no consent to give.
- [ ] What the second machine cannot recover is named. If anything about the organization is
      genuinely machine-local, this is where it is found, and finding it here is the point of doing
      this as its own ticket rather than assuming ticket 12 covered it.
- [ ] `cargo test` and the repository's gates pass.

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
