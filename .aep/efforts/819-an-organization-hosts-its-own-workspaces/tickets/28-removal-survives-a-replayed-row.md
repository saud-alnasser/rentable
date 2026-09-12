---
status: open
blocked-by: []
---

# fix(organization): removal durably ends access, against a replayed row

## Outcome

An ordinary removal ends a removed member's access even against a modified client that still holds
the organization-database credential. Today it does not: this is finding F-A of the effort's second
correctness review, left open deliberately and scheduled here rather than accepted.

## Background

Ordinary removal re-signs the member row as `removed` and deletes the grant, and
`renew_credentials` skips members whose row reads `removed` (ticket 24). But `MemberAuthority` signs
only `{public_key, role, permissions}` with no id, nonce, or monotonic field, and the organization
database credential is deliberately not rotated on an ordinary removal (requirement 14 keeps offline
members and restore working). So a removed member with a modified client can `INSERT OR REPLACE`
their own old, still-validly-signed `role=member` row, flipping `removed` back; the signature
verifies because it covers exactly the replayed bytes and the signing certificate is still live.
The owner's next renewal (ticket 24's `organization_renew_due`) then re-seals them a fresh
credential. Requirement 16 does not cover this, because it forbids a member altering *another*
member's row; this is a member replaying *their own* historical row.

Requirement 14 promises no new credential reaches a removed member, and this defeats it. The plan's
existing answer to row corruption, Turso point-in-time restore, does not restore this promise: the
replay leaves the database internally consistent.

## The design question this carries

There is no obviously-correct fix inside the current model, which is why this is a ticket with a
plan decision in front of it rather than a straightforward build. The candidates, each with a cost:

- **A monotonic version on every signed authority row, rejected when it goes backwards.** Closes
  replay, but a fresh machine and a restored machine have no local high-water mark to judge
  "backwards" against, so where the mark lives and how it survives a restore is the hard part.
- **Rotate the organization-database credential on every removal.** Simple and total, but it breaks
  requirement 18's offline members and the restore path the effort deliberately protects by not
  rotating it. Rejected once already in spirit; revisit only with that cost named.
- **Accept it as a documented limitation** with lock-out and point-in-time restore as the
  recovery. This is the option the run did not take; if the plan lands here, requirement 14 is
  amended to say what removal actually guarantees.

**This likely warrants a plan revision** ([[skills/plan]]) rather than being built straight from
this ticket, because it changes the authority model or a requirement. Whoever picks it up decides
that first.

## Acceptance Criteria

Traces requirement 14 and requirement 16 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 14.

- [ ] A removed member who replays their own old `role=member` row and grant row, holding the
      organization-database credential, is issued no fresh credential by the owner's renewal, and a
      test performs exactly that replay.
- [ ] Whatever mechanism is chosen keeps requirement 18 (a signed-in member works offline) and the
      restore path (requirement 6) intact, or the requirement it cannot keep is amended in `spec.md`
      with the reasoning, under the plan decision above.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

## Constraints

- **No escrow key, and no rotation that breaks an offline member without that cost being named and
  accepted in the spec.** The effort's constraints on the credential model still hold.
- A changeset rides with the change if it reaches a user.

## Notes

Surfaced by the second correctness review on 2026-09-12; the human chose to schedule it rather than
accept it, which is why requirement 14 is not amended and the effort's pull request is left not
ready with this open.
