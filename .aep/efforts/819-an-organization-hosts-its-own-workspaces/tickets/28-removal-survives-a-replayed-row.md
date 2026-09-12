---
status: resolved
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

## Decision (2026-09-12)

The human took the third option: **accept it as a documented limitation.** A monotonic version was
rejected again because no fresh or restored machine holds a high-water mark to judge a replay
against, and rotate-on-removal was rejected again because it is the offline breakage requirement 14
settled against on 2026-08-30. Requirement 14 in `spec.md` is amended to state what the ordinary
path guarantees, that a determined replay defeats it, and that "remove and lock out now" is the
answer to a hostile departure; a test pins the replay as behaviour. The authority model does not
change, so requirements 18 and 6 are untouched.

## Acceptance Criteria

Traces requirement 14 and requirement 16 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 14.

- [x] The plan decision above is taken and recorded where it was asked for: requirement 14 in
      `spec.md` is amended to state that an ordinary removal ends renewal but not a determined
      replay, and that "remove and lock out now" is the answer to a hostile departure.
      *Verified: requirement 14 gained the "Ordinary Remove ends renewal, not a determined replay"
      paragraph and a *Settled 2026-09-12* note; acceptance criterion 14 narrowed to the untampered
      case plus the replay limitation; `plan.md` row 14 mirrors it.*
- [x] A test performs exactly the replay: a removed member writes back their own old signed
      `role=member` row and grant, and the owner's renewal re-credentials them, pinning the
      limitation as behaviour rather than a latent bug.
      *Verified: `an_ordinary_removal_does_not_defeat_a_members_replay_of_their_own_row` in
      `organization/workspace.rs` asserts `renew_credentials` returns 2 after an ordinary removal
      and 3 after the replay; `cargo test -- --test-threads=1` -> `281 passed; 0 failed`.*
- [x] The accepted design keeps requirement 18 (offline sign-in) and requirement 6 (restore)
      untouched: no credential rotation and no new signed field is added on the ordinary path.
      *Verified: the diff adds only a test and documentation; no runtime code path, credential
      rotation, or signed-row schema changed, so offline sign-in and restore are unaffected.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.
      *Verified below at landing: `cargo test` 281 passed / 10 ignored, `cargo clippy` at the 5
      pre-existing warnings and none in the new code, `pnpm check`/`lint`/`test` unchanged (no
      TypeScript changed).*

## Constraints

- **No escrow key, and no rotation that breaks an offline member without that cost being named and
  accepted in the spec.** The effort's constraints on the credential model still hold.
- A changeset rides with the change if it reaches a user.

## Notes

Surfaced by the second correctness review on 2026-09-12; the human chose to schedule it rather than
accept it, which is why requirement 14 is not amended and the effort's pull request is left not
ready with this open.
