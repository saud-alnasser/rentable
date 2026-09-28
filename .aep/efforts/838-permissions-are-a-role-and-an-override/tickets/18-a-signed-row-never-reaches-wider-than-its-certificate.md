---
status: resolved
---

# fix(organization): a signed row never reaches wider than its certificate

## Outcome

Review, round one, correctness. Four defects, each shown by a failing test: a member or role row
wider than its signer's ceiling verified everywhere, a member's own row included, and a later role
edit then re-issued the widened member's certificate with that width; an invitation or a reset by
an actor without `grantWorkspace` wrote the account's directory grant, which every reader then
refused, bricking the grants for the whole organization; a rename by a holder of `renameMember` of
somebody at or above them, the owner included, wrote a member row every reader refused; and a
handover left the new owner two live certificates. After this, the chain bounds what a row gives by
the ceiling of the certificate that signs it and refuses a certificate signing its own holder's
row, per the corrected row-kind table in [[efforts/838-permissions-are-a-role-and-an-override/plan]],
*Architecture*; the store refuses to write a row the signer's certificate does not cover, so no
command can write a row every reader refuses; and each command refuses before it writes.

## Acceptance Criteria

Traces requirements 7 and 9 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criteria 7 and 9.

- [x] `authority::covers` refuses a member row whose effective permissions carry a flag the signing
      certificate's ceiling lacks, and one signed by a delegated certificate naming the row's own
      member; and a role row whose mask carries a flag the ceiling lacks. A test per case, each
      shown failing first, reproducing the review's cases: a member widening their own override,
      the widened certificate re-issued by a later role edit, and a manager writing a role with a
      flag they lack.
- [x] The store's writes of a signed row refuse, naming what is needed (`authority::needed_for`),
      a row the signer's certificate does not cover, before anything is written, with a test.
- [x] Making an account and resetting one refuse, naming `grantWorkspace`, an actor who does not
      hold it, since each writes the account's directory grant; with a test that nothing is written
      and the grants still read.
- [x] Renaming a member is refused at or above the actor's rank, of the owner, and of oneself where
      the rules of rank say so, like every other act on an account, with a test that the directory
      still reads.
- [x] After a handover the new owner holds exactly one live certificate, the root; the rows their
      earlier certificate signed are re-signed under it first. The handover test asserts it.
- [x] The Rust comments the effort made false are corrected: `authority.rs` on who sets the mark,
      `error.rs` on `NotAdministrator`, and any other the grep for administrator finds in a comment
      that describes the present.

## Relevant areas

- `tauri/src/organization/authority.rs` (`covers`, `Chain`), `store.rs` (the `write_*` of signed rows)
- `organization/invite.rs` (`write_account`, `create_account`, `rename_member`), `role.rs`
  (`accept_ownership`), `error.rs`

## Constraints

- The walk and the revocation rules are unchanged; only the row-kind table and the writes change.
- Every row a command writes today that the corrected table would refuse is either refused at the
  command by name or shown not to occur, never left to the reader.
