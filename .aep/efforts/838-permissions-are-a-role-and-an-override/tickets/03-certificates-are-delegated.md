---
status: resolved
blocked-by: [01, 02]
---

# feat(organization): certificates are delegated and carry a ceiling and a rank

## Outcome

A certificate names its issuer, its ceiling and its rank under its signature, and verifies by
walking to the pinned key; a revocation is a signed row; a row verifies only when its certificate
verifies and the row is within it, by the row-kind table. This ticket builds the chain and its
readers; the flows that write rows move onto it in 04 to 06.

## Acceptance Criteria

Traces requirement 9 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criterion 9.

- [x] `certificate.v2` and `revocation.v1` preimages as [[efforts/838-permissions-are-a-role-and-an-override/plan]], *Architecture*, gives them; the old
      certificate preimage and `revoked_at` are no longer read.
- [x] The walk: issuer signature (the pinned key at a root), issuer not revoked, ceiling within the
      issuer's, rank below the issuer's, issuer holding a `MEMBER_ADMINISTRATION` flag; a cycle and
      a depth past 16 refused. One test per check, each shown failing before it passes.
- [x] A revocation verifies only when its revoker's certificate verifies and outranks the revoked
      one, or is the root; a certificate below a revoked one reads as revoked.
- [x] The row-kind table in `authority.rs` is exactly the plan's; a test per row kind signs it under
      a certificate lacking the flag, and under one not outranking the subject, and both are refused.
- [x] The verified readers in `store.rs` verify through the walk, with a per-read certificate cache.

## Relevant areas

- `apps/desktop/tauri/src/organization/authority.rs` (`verify`, the preimages, the fixed-vector test)
- `organization/store.rs` (`verified`, the readers, the `administrator_certificate` table)

## Constraints

- Nothing reads a key out of the database it judges; the root is the pinned key alone.
- The fixed-vector test (`a_checked_in_certificate_and_row_match_an_implementation_outside_this_crate`)
  is regenerated for v2, not deleted.
- The chain-level half of criterion 9 lives here; 04 to 07 add the flow-level half.
